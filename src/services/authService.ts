import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { signAccessToken, signAccessTokenUntil } from '../lib/jwt';
import { toAppUser } from '../lib/mappers';
import { ApiError } from '../lib/errors';
import { verifySocialToken, type SocialProvider } from '../lib/socialAuth';
import { env } from '../config/env';
import type { AppUser, ClubSignupInput, LoginInput, PlayerSignupInput, Session, UserRole } from '../types';

async function createSessionForUser(user: AppUser): Promise<Session> {
  const expiresAt = new Date(Date.now() + env.sessionLengthDays * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt },
  });
  const token = signAccessToken({ sub: user.id, role: user.role, jti: session.id });
  return { user, token, expiresAt: expiresAt.toISOString() };
}

/** Ported from cuemaster-ui's mockAuthService.ts (`generateUniqueUsername`) —
 * the algorithm must match exactly per docs/BACKEND.md's Social Login
 * section, since usernames are user-visible handles a player might notice
 * either app assigned. Already lowercase (`replace` only keeps [a-z0-9_]),
 * consistent with the plain signup path's canonical-lowercase usernames. */
async function generateUniqueUsername(seed: string): Promise<string> {
  const base = seed.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'player';
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop -- small, bounded, sequential by nature
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export const authService = {
  async signupPlayer(input: PlayerSignupInput): Promise<Session> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists.');

    const usernameTaken = await prisma.user.findUnique({ where: { username: input.username } });
    if (usernameTaken) throw ApiError.conflict('That username is already taken.');

    const row = await prisma.user.create({
      data: {
        role: 'player',
        email: input.email,
        displayName: input.displayName,
        username: input.username,
        passwordHash: await hashPassword(input.password),
      },
    });
    return createSessionForUser(toAppUser(row));
  },

  async signupClub(input: ClubSignupInput): Promise<Session> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists.');

    const row = await prisma.user.create({
      data: {
        role: 'club',
        email: input.email,
        displayName: input.clubName,
        clubName: input.clubName,
        address: input.address,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
      },
    });
    return createSessionForUser(toAppUser(row));
  },

  async login(input: LoginInput): Promise<Session> {
    const row = await prisma.user.findUnique({ where: { email: input.email } });
    if (!row) throw ApiError.unauthorized('No account found with that email.');

    // A social-only account (see loginWithSocial below) has no passwordHash —
    // fail with the same generic message as a wrong password, per
    // docs/BACKEND.md, rather than a 500 or a message that leaks which
    // accounts are social-only.
    if (!row.passwordHash) throw ApiError.unauthorized('Incorrect email or password.');

    const ok = await verifyPassword(input.password, row.passwordHash);
    if (!ok) throw ApiError.unauthorized('Incorrect email or password.');

    return createSessionForUser(toAppUser(row));
  },

  /** POST /auth/social/:provider — see docs/BACKEND.md's Social Login
   * section for the full find-or-create logic this implements: link an
   * existing linked identity, else link by email, else create a new
   * account. `token` is verified server-side (src/lib/socialAuth.ts) —
   * never trust the client's own claim of who it is. */
  async loginWithSocial(provider: SocialProvider, token: string, role: UserRole): Promise<Session> {
    const profile = await verifySocialToken(provider, token);

    const linked = await prisma.socialIdentity.findUnique({
      where: { provider_providerId: { provider, providerId: profile.providerId } },
    });
    if (linked) {
      const row = await prisma.user.findUnique({ where: { id: linked.userId } });
      if (row) return createSessionForUser(toAppUser(row));
      // Identity row survived a since-deleted user — fall through and treat
      // this as a fresh sign-in rather than erroring; shouldn't normally
      // happen since there's no user-delete endpoint today.
    }

    // No linked identity yet — if an account with this email already exists
    // (e.g. they originally signed up with a password), link this provider
    // to it rather than creating a duplicate account.
    const existingByEmail = profile.email ? await prisma.user.findUnique({ where: { email: profile.email } }) : null;
    if (existingByEmail) {
      await prisma.socialIdentity.create({
        data: { userId: existingByEmail.id, provider, providerId: profile.providerId },
      });
      return createSessionForUser(toAppUser(existingByEmail));
    }

    const email = profile.email ?? `${provider}-${profile.providerId}@no-email.cuemaster.app`;
    const row =
      role === 'club'
        ? await prisma.user.create({
            data: {
              role: 'club',
              email,
              displayName: profile.name,
              clubName: profile.name,
              avatarUrl: profile.avatarUrl,
              // passwordHash omitted — social-only account, see schema comment.
            },
          })
        : await prisma.user.create({
            data: {
              role: 'player',
              email,
              displayName: profile.name,
              username: await generateUniqueUsername(profile.name || email.split('@')[0]),
              avatarUrl: profile.avatarUrl,
            },
          });
    await prisma.socialIdentity.create({ data: { userId: row.id, provider, providerId: profile.providerId } });
    return createSessionForUser(toAppUser(row));
  },

  async logout(sessionId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  },

  /** Resolves the bearer token already validated by requireAuth back into a
   * full Session — this is exactly what GET /auth/me does. The response's
   * `token` is a freshly re-signed JWT carrying the *same* session id (jti)
   * and expiry as the one presented (we never persist the raw JWT itself,
   * only the revocable Session row it's derived from), so it round-trips
   * through requireAuth identically to the token the client already has. */
  async getSession(userId: string, sessionId: string): Promise<Session | null> {
    const [session, row] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!session || !row || session.expiresAt.getTime() < Date.now()) return null;

    const user = toAppUser(row);
    const token = signAccessTokenUntil({ sub: user.id, role: user.role, jti: session.id }, session.expiresAt);
    return { user, token, expiresAt: session.expiresAt.toISOString() };
  },
};
