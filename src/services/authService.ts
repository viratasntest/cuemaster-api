import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { signAccessToken, signAccessTokenUntil } from '../lib/jwt';
import { toAppUser } from '../lib/mappers';
import { ApiError } from '../lib/errors';
import { env } from '../config/env';
import type { AppUser, ClubSignupInput, LoginInput, PlayerSignupInput, Session } from '../types';

async function createSessionForUser(user: AppUser): Promise<Session> {
  const expiresAt = new Date(Date.now() + env.sessionLengthDays * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt },
  });
  const token = signAccessToken({ sub: user.id, role: user.role, jti: session.id });
  return { user, token, expiresAt: expiresAt.toISOString() };
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

    const ok = await verifyPassword(input.password, row.passwordHash);
    if (!ok) throw ApiError.unauthorized('Incorrect email or password.');

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
