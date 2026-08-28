import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../lib/errors';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
    return;
  }
  if (err instanceof MulterError) {
    // POST /users/me/avatar (avatarUpload middleware) — see docs/BACKEND.md's
    // Avatar Upload section for the size/type limits these codes come from.
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Avatar must be ${Math.floor(env.avatarMaxBytes / (1024 * 1024))}MB or smaller.`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Expected the file in a form field named "avatar".`
          : err.message;
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Error) {
    // Errors thrown by services as plain `new Error(...)` (matching the mock's
    // style) default to 400 — they're always validation/business-rule messages
    // meant to be shown to the user, never internal leakage.
    console.error(err);
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
