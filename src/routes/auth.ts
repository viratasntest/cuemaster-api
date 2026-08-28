import { Router } from 'express';
import { authService } from '../services/authService';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../lib/asyncHandler';
import { clubSignupSchema, loginSchema, playerSignupSchema } from '../schemas';

export const authRouter = Router();

authRouter.post(
  '/signup/player',
  validateBody(playerSignupSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.signupPlayer(req.body);
    res.status(201).json(session);
  }),
);

authRouter.post(
  '/signup/club',
  validateBody(clubSignupSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.signupClub(req.body);
    res.status(201).json(session);
  }),
);

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body);
    res.status(200).json(session);
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.auth!.sessionId);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await authService.getSession(req.auth!.userId, req.auth!.sessionId);
    if (!session) {
      res.status(401).json({ error: 'Session not found' });
      return;
    }
    res.status(200).json(session);
  }),
);
