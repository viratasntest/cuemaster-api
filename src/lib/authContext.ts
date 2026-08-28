import { prisma } from './prisma';
import { verifyAccessToken } from './jwt';

export interface AuthContext {
  userId: string;
  role: 'player' | 'club';
  sessionId: string;
}

/** Resolves a bearer token into an AuthContext, or null if missing/invalid/
 * expired/revoked. Shared by the REST auth middleware (middleware/auth.ts)
 * and the Socket.IO handshake auth (realtime/socketServer.ts) so both
 * transports enforce identical rules — see docs/BACKEND.md's auth model. */
export async function resolveAuthContext(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;

  const claims = verifyAccessToken(token);
  if (!claims) return null;

  const session = await prisma.session.findUnique({ where: { id: claims.jti } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  return { userId: claims.sub, role: claims.role, sessionId: session.id };
}
