import type { Match as MatchRow } from '@prisma/client';
import type { Frame, Match, MatchStatus } from '../types';

/** Converts a DB match row (JSON-blob frames/frameWins/playerIds, Date columns)
 * into the wire-shaped `Match` the API contract promises. */
export function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    matchTypeId: row.matchTypeId,
    status: row.status as MatchStatus,
    playerIds: row.playerIds as string[],
    frames: row.frames as unknown as Frame[],
    frameWins: row.frameWins as Record<string, number>,
    winnerId: row.winnerId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}
