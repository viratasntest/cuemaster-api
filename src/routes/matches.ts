import { Router } from 'express';
import { matchService } from '../services/matchService';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../lib/errors';
import { createSoloMatchSchema } from '../schemas';

export const matchesRouter = Router();

matchesRouter.post(
  '/solo',
  validateBody(createSoloMatchSchema),
  asyncHandler(async (req, res) => {
    const match = await matchService.createSoloMatch(req.auth!.userId, req.body.matchTypeId);
    res.status(201).json(match);
  }),
);

// Registered before '/:id' so "?userId=" history reads aren't shadowed.
matchesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (!userId) throw ApiError.badRequest('userId query param is required.');
    const matches = await matchService.listMatchHistory(userId);
    res.status(200).json(matches);
  }),
);

matchesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const match = await matchService.getMatch(req.params.id);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    res.status(200).json(match);
  }),
);
