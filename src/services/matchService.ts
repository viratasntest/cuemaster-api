import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { toMatch } from '../lib/matchMapper';
import { createFrame } from '../scoring/scoring';
import { ApiError } from '../lib/errors';
import type { Match, MatchType } from '../types';

/** Matches store playerIds as JSON (see prisma/schema.prisma) rather than a
 * normalized field, so "matches involving this user" can't be pushed down as
 * a `where` clause via Prisma's Mongo connector — we filter in JS instead,
 * same linear-scan posture the mock explicitly accepts at this data scale. A
 * deployment that outgrows this could add a raw Mongo query
 * (`{ playerIds: userId }`, which Mongo matches against array fields
 * natively) here to scale past it. */
async function findMatchesForUser(userId: string) {
  const rows = await prisma.match.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.filter((r) => (r.playerIds as string[]).includes(userId));
}

export const matchService = {
  async listMatchTypes(): Promise<MatchType[]> {
    return prisma.matchType.findMany();
  },

  async getMatchType(matchTypeId: string): Promise<MatchType | null> {
    return prisma.matchType.findUnique({ where: { id: matchTypeId } });
  },

  async createSoloMatch(userId: string, matchTypeId: string): Promise<Match> {
    const matchType = await prisma.matchType.findUnique({ where: { id: matchTypeId } });
    if (!matchType) throw ApiError.badRequest('Unknown match type.');

    const row = await prisma.match.create({
      data: {
        matchTypeId,
        status: 'in_progress',
        playerIds: [userId],
        frames: [createFrame('', 1, userId)] as unknown as Prisma.InputJsonValue,
        frameWins: { [userId]: 0 },
        startedAt: new Date(),
      },
    });
    // Frame.matchId needs the real generated match id — patch it in now that
    // we have one (mirrors the mock, which knows matchId up front via its own
    // id generator; here the DB assigns it on insert).
    const frames = (row.frames as any[]).map((f) => ({ ...f, matchId: row.id }));
    const updated = await prisma.match.update({
      where: { id: row.id },
      data: { frames: frames as unknown as Prisma.InputJsonValue },
    });
    return toMatch(updated);
  },

  async getMatch(matchId: string): Promise<Match | null> {
    const row = await prisma.match.findUnique({ where: { id: matchId } });
    return row ? toMatch(row) : null;
  },

  async listMatchHistory(userId: string): Promise<Match[]> {
    const rows = await findMatchesForUser(userId);
    return rows.map(toMatch);
  },
};

export { findMatchesForUser };
