import { deriveBreaks } from './scoring';
import { nowIso } from './time';
import type { CareerStats, Match } from '../types';

/**
 * Computes career stats from a user's match history — ported verbatim from
 * cuemaster-ui/src/utils/stats.ts per docs/BACKEND.md ("Stats derivation").
 * Pure function: given the same matches, it must return the same stats
 * whether it runs on-device or here.
 */
export function computeCareerStats(userId: string, matches: Match[]): CareerStats {
  const completed = matches.filter((m) => m.status === 'completed' && m.playerIds.includes(userId));
  const versusMatches = completed.filter((m) => m.playerIds.length === 2);

  let framesPlayed = 0;
  let framesWon = 0;
  let totalPointsScored = 0;
  const allBreaks: number[] = [];

  for (const match of completed) {
    const isVersus = match.playerIds.length === 2;
    for (const frame of match.frames) {
      if (!frame.completedAt) continue;
      if (isVersus) {
        framesPlayed += 1;
        if (frame.winnerId === userId) framesWon += 1;
      }
      totalPointsScored += frame.scores[userId] ?? 0;
      const breaks = deriveBreaks(frame)[userId] ?? [];
      allBreaks.push(...breaks);
    }
  }

  const highestBreak = allBreaks.length > 0 ? Math.max(...allBreaks) : 0;
  const centuries = allBreaks.filter((value) => value >= 100).length;
  const averageBreak = allBreaks.length > 0 ? allBreaks.reduce((a, b) => a + b, 0) / allBreaks.length : 0;

  return {
    userId,
    matchesPlayed: versusMatches.length,
    matchesWon: versusMatches.filter((m) => m.winnerId === userId).length,
    framesPlayed,
    framesWon,
    highestBreak,
    centuries,
    totalPointsScored,
    averageBreak: Math.round(averageBreak * 10) / 10,
    lastUpdated: nowIso(),
  };
}
