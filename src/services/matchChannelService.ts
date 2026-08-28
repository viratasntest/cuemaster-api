import { prisma } from '../lib/prisma';
import { toMatch } from '../lib/matchMapper';
import * as scoring from '../scoring/scoring';
import { ApiError } from '../lib/errors';
import type { Prisma, Match as MatchRow } from '@prisma/client';
import type { BallValue, Frame, FoulValue, Match, MatchInvite } from '../types';

/**
 * Backs the realtime `match:*`/`invite:*` actions in src/realtime/ — ported
 * from mockRealtimeService.ts's `matchChannel`, but:
 *  - the acting user comes from the authenticated socket, never a client-
 *    supplied id (see requireParticipant/requireInviteParty below) — the mock
 *    could trust its args because it's an in-process library call, a real
 *    backend can't;
 *  - persistence goes through Prisma instead of mockDb, and broadcasting is
 *    the caller's (socketServer.ts's) job, not this module's — this module
 *    only returns the updated rows so the caller can decide who to emit to.
 */

function toInvite(row: {
  id: string;
  matchTypeId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  matchId: string | null;
}): MatchInvite {
  return {
    id: row.id,
    matchTypeId: row.matchTypeId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status as MatchInvite['status'],
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
    matchId: row.matchId ?? undefined,
  };
}

async function getMatchRowOrThrow(matchId: string): Promise<MatchRow> {
  const row = await prisma.match.findUnique({ where: { id: matchId } });
  if (!row) throw ApiError.notFound('Match not found');
  return row;
}

function requireParticipant(row: MatchRow, userId: string): void {
  if (!(row.playerIds as string[]).includes(userId)) {
    throw ApiError.forbidden('You are not a participant in this match.');
  }
}

function currentFrame(row: MatchRow): Frame {
  const frames = row.frames as unknown as Frame[];
  const frame = frames[frames.length - 1];
  if (!frame) throw ApiError.badRequest('Match has no active frame');
  return frame;
}

function withCurrentFrame(row: MatchRow, frame: Frame): Frame[] {
  const frames = [...(row.frames as unknown as Frame[])];
  frames[frames.length - 1] = frame;
  return frames;
}

function requireOpponent(row: MatchRow, playerId: string): string {
  const opponentId = scoring.opponentOf({ playerIds: row.playerIds as string[] }, playerId);
  if (!opponentId) throw ApiError.badRequest('This match has no opponent (solo/practice match).');
  return opponentId;
}

/** Alternates who opens each frame, starting with playerIds[0] in frame 1. */
function nextFrameOpener(playerIds: string[], frameNumber: number): string {
  if (playerIds.length < 2) return playerIds[0];
  return playerIds[(frameNumber - 1) % playerIds.length];
}

async function persist(matchId: string, frames: Frame[], extra: Prisma.MatchUpdateInput = {}): Promise<Match> {
  const row = await prisma.match.update({
    where: { id: matchId },
    data: { frames: frames as unknown as Prisma.InputJsonValue, ...extra },
  });
  return toMatch(row);
}

async function finishFrameAndAdvance(row: MatchRow, winnerId: string): Promise<Match> {
  const matchType = await prisma.matchType.findUnique({ where: { id: row.matchTypeId } });
  const framesToWin = matchType?.framesToWin ?? 2;

  const completedFrame = scoring.completeFrame(currentFrame(row), winnerId);
  let frames = withCurrentFrame(row, completedFrame);
  const frameWins = { ...(row.frameWins as Record<string, number>), [winnerId]: ((row.frameWins as Record<string, number>)[winnerId] ?? 0) + 1 };

  if (frameWins[winnerId] >= framesToWin) {
    return persist(row.id, frames, {
      frameWins: frameWins as unknown as Prisma.InputJsonValue,
      status: 'completed',
      winnerId,
      completedAt: new Date(),
    });
  }

  const nextFrameNumber = completedFrame.frameNumber + 1;
  const opener = nextFrameOpener(row.playerIds as string[], nextFrameNumber);
  frames = [...frames, scoring.createFrame(row.id, nextFrameNumber, opener)];
  return persist(row.id, frames, { frameWins: frameWins as unknown as Prisma.InputJsonValue });
}

export const matchChannelService = {
  async getPendingInvites(userId: string): Promise<MatchInvite[]> {
    const rows = await prisma.matchInvite.findMany({ where: { toUserId: userId, status: 'pending' } });
    return rows.map(toInvite);
  },

  async sendInvite(fromUserId: string, toUserId: string, matchTypeId: string): Promise<MatchInvite> {
    if (fromUserId === toUserId) throw ApiError.badRequest("You can't invite yourself.");
    const [toUser, matchType] = await Promise.all([
      prisma.user.findUnique({ where: { id: toUserId } }),
      prisma.matchType.findUnique({ where: { id: matchTypeId } }),
    ]);
    if (!toUser) throw ApiError.badRequest('Unknown recipient.');
    if (!matchType) throw ApiError.badRequest('Unknown match type.');

    const row = await prisma.matchInvite.create({
      data: { matchTypeId, fromUserId, toUserId, status: 'pending' },
    });
    return toInvite(row);
  },

  /** Returns the updated invite and, if accepted, the newly created match —
   * the caller uses `match` to know which sockets to join to `match:<id>`. */
  async respondToInvite(userId: string, inviteId: string, accept: boolean): Promise<{ invite: MatchInvite; match?: Match }> {
    const invite = await prisma.matchInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw ApiError.notFound('Invite not found');
    if (invite.toUserId !== userId) throw ApiError.forbidden('Only the invitee can respond to this invite.');
    if (invite.status !== 'pending') throw ApiError.conflict('This invite is no longer pending.');

    if (!accept) {
      const declined = await prisma.matchInvite.update({
        where: { id: inviteId },
        data: { status: 'declined', respondedAt: new Date() },
      });
      return { invite: toInvite(declined) };
    }

    const matchRow = await prisma.match.create({
      data: {
        matchTypeId: invite.matchTypeId,
        status: 'in_progress',
        playerIds: [invite.fromUserId, invite.toUserId],
        frames: [scoring.createFrame('', 1, invite.fromUserId)] as unknown as Prisma.InputJsonValue,
        frameWins: { [invite.fromUserId]: 0, [invite.toUserId]: 0 },
        startedAt: new Date(),
      },
    });
    const frames = (matchRow.frames as any[]).map((f) => ({ ...f, matchId: matchRow.id }));
    const finalMatchRow = await prisma.match.update({
      where: { id: matchRow.id },
      data: { frames: frames as unknown as Prisma.InputJsonValue },
    });

    const accepted = await prisma.matchInvite.update({
      where: { id: inviteId },
      data: { status: 'accepted', respondedAt: new Date(), matchId: matchRow.id },
    });
    return { invite: toInvite(accepted), match: toMatch(finalMatchRow) };
  },

  async cancelInvite(userId: string, inviteId: string): Promise<MatchInvite> {
    const invite = await prisma.matchInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw ApiError.notFound('Invite not found');
    if (invite.fromUserId !== userId) throw ApiError.forbidden('Only the sender can cancel this invite.');
    if (invite.status !== 'pending') throw ApiError.conflict('This invite is no longer pending.');

    const row = await prisma.matchInvite.update({
      where: { id: inviteId },
      data: { status: 'cancelled', respondedAt: new Date() },
    });
    return toInvite(row);
  },

  async potBall(userId: string, matchId: string, playerId: string, value: BallValue): Promise<Match> {
    const row = await getMatchRowOrThrow(matchId);
    requireParticipant(row, userId);
    const frame = scoring.applyPot(currentFrame(row), playerId, value);
    return persist(matchId, withCurrentFrame(row, frame));
  },

  async foul(userId: string, matchId: string, foulingPlayerId: string, value: FoulValue): Promise<Match> {
    const row = await getMatchRowOrThrow(matchId);
    requireParticipant(row, userId);
    const opponentId = requireOpponent(row, foulingPlayerId);
    const frame = scoring.applyFoul(currentFrame(row), foulingPlayerId, opponentId, value);
    return persist(matchId, withCurrentFrame(row, frame));
  },

  async switchPlayer(userId: string, matchId: string, playerId: string): Promise<Match> {
    const row = await getMatchRowOrThrow(matchId);
    requireParticipant(row, userId);
    const opponentId = requireOpponent(row, playerId);
    const frame = scoring.applySwitch(currentFrame(row), playerId, opponentId);
    return persist(matchId, withCurrentFrame(row, frame));
  },

  async endFrame(userId: string, matchId: string, winnerId: string): Promise<Match> {
    const row = await getMatchRowOrThrow(matchId);
    requireParticipant(row, userId);
    return finishFrameAndAdvance(row, winnerId);
  },

  async concedeMatch(userId: string, matchId: string, concedingPlayerId: string): Promise<Match> {
    const row = await getMatchRowOrThrow(matchId);
    requireParticipant(row, userId);
    const opponentId = requireOpponent(row, concedingPlayerId);
    const frame = scoring.applyConcede(currentFrame(row), concedingPlayerId, opponentId);
    const frames = withCurrentFrame(row, frame);
    return persist(matchId, frames, { status: 'completed', winnerId: opponentId, completedAt: new Date() });
  },
};
