import type { NextFunction, Request, Response } from 'express';
import { resolveAuthContext, type AuthContext } from '../lib/authContext';
import { ApiError } from '../lib/errors';

export type { AuthContext };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Resolves a bearer token into `req.auth`, or throws 401. Verifies both the
 * JWT signature/expiry and that the session hasn't been revoked (logout) or
 * expired server-side — see docs/BACKEND.md's auth model. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing bearer token');
    }

    const auth = await resolveAuthContext(token);
    if (!auth) throw ApiError.unauthorized('Invalid, expired, or revoked token');

    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}
