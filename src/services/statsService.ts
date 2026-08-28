import { toMatch } from '../lib/matchMapper';
import { computeCareerStats } from '../scoring/stats';
import { findMatchesForUser } from './matchService';
import type { CareerStats } from '../types';

export const statsService = {
  async getCareerStats(userId: string): Promise<CareerStats> {
    const rows = await findMatchesForUser(userId);
    return computeCareerStats(userId, rows.map(toMatch));
  },
};
