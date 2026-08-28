import { Router } from 'express';
import { matchService } from '../services/matchService';
import { asyncHandler } from '../lib/asyncHandler';

export const matchTypesRouter = Router();

matchTypesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const types = await matchService.listMatchTypes();
    res.status(200).json(types);
  }),
);
