import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;

/** Wraps an async route handler so a rejected promise reaches errorHandler
 * instead of crashing the process (Express doesn't do this automatically
 * for async handlers pre-v5). */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
