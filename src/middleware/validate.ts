import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

/** Parses+validates req.body against `schema`, replacing it with the parsed
 * (and type-coerced/trimmed) value. Validation errors flow to errorHandler. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
