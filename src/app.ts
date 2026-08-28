import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { apiRouter } from './routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { ensureUploadDir, uploadDir } from './lib/uploads';

export function createApp(): Express {
  ensureUploadDir();
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Publicly readable (no requireAuth) — see docs/BACKEND.md's Avatar Upload
  // section: an avatarUrl needs to load directly in an <Image>, not sit
  // behind the bearer-auth middleware every other route below does.
  app.use('/uploads', express.static(uploadDir));

  app.use(apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
