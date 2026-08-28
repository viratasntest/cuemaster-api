import { Router } from 'express';
import { statsService } from '../services/statsService';
import { asyncHandler } from '../lib/asyncHandler';

export const statsRouter = Router();

statsRouter.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const stats = await statsService.getCareerStats(req.params.id);
    res.status(200).json(stats);
  }),
);
