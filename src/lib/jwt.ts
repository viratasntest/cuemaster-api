import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenClaims {
  sub: string; // user id
  role: 'player' | 'club';
  jti: string; // Session.id — lets logout revoke a specific token
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: `${env.sessionLengthDays}d` });
}

/** Signs a token expiring at a specific instant rather than a fixed duration
 * from now — used to re-issue a token for an existing Session (GET /auth/me)
 * without extending its actual expiry. */
export function signAccessTokenUntil(claims: AccessTokenClaims, expiresAt: Date): string {
  const seconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign(claims, env.jwtSecret, { expiresIn: seconds });
}

/** Returns the decoded claims, or null if the token is missing/invalid/expired.
 * Callers still need to check the `jti` against the Session table to catch
 * tokens that were explicitly revoked (logout) before their expiry. */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AccessTokenClaims;
  } catch {
    return null;
  }
}
