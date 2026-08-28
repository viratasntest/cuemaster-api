import { generateId } from './id';
import { nowIso } from './time';
import type { BallValue, Frame, FrameEvent, FoulValue, Match } from '../types';

/**
 * Pure snooker scoring engine — ported verbatim from cuemaster-ui/src/utils/scoring.ts
 * per docs/BACKEND.md ("Reuse the scoring engine as-is"). Only the id/time helper
 * imports differ (uuid-backed ids instead of Math.random, since ids are now shared
 * across a real database and multiple clients). Do not change the algorithm here
 * without changing it in cuemaster-ui too — they must stay behaviorally identical.
 */

export function opponentOf(match: Pick<Match, 'playerIds'>, playerId: string): string | undefined {
  return match.playerIds.find((id) => id !== playerId);
}

export function createFrame(matchId: string, frameNumber: number, openingPlayerId: string): Frame {
  return {
    id: generateId('frame'),
    matchId,
    frameNumber,
    scores: {},
    currentBreak: {},
    onBreakPlayerId: openingPlayerId,
    highestBreak: null,
    events: [],
  };
}

function pushEvent(frame: Frame, type: FrameEvent['type'], playerId: string, value: number): Frame {
  const event: FrameEvent = {
    id: generateId('evt'),
    frameId: frame.id,
    type,
    playerId,
    value,
    createdAt: nowIso(),
  };
  return { ...frame, events: [...frame.events, event] };
}

/** Player pots a ball: points to them, break continues, they stay at the table. */
export function applyPot(frame: Frame, playerId: string, value: BallValue): Frame {
  const next = pushEvent(frame, 'pot', playerId, value);
  const scores = { ...next.scores, [playerId]: (next.scores[playerId] ?? 0) + value };
  const breakValue = (next.currentBreak[playerId] ?? 0) + value;
  const currentBreak = { ...next.currentBreak, [playerId]: breakValue };
  const highestBreak =
    !next.highestBreak || breakValue > next.highestBreak.value
      ? { playerId, value: breakValue }
      : next.highestBreak;
  return { ...next, scores, currentBreak, onBreakPlayerId: playerId, highestBreak };
}

/** Player fouls: points go to the opponent, the fouling player's break ends and
 * the opponent goes to the table. */
export function applyFoul(frame: Frame, foulingPlayerId: string, opponentId: string, value: FoulValue): Frame {
  const next = pushEvent(frame, 'foul', foulingPlayerId, value);
  const scores = { ...next.scores, [opponentId]: (next.scores[opponentId] ?? 0) + value };
  const currentBreak = { ...next.currentBreak, [foulingPlayerId]: 0 };
  return { ...next, scores, currentBreak, onBreakPlayerId: opponentId };
}

/** Player misses/plays a safety with no foul: their break ends, no points change,
 * turn passes to the opponent. */
export function applySwitch(frame: Frame, playerId: string, opponentId: string): Frame {
  const next = pushEvent(frame, 'switch', playerId, 0);
  const currentBreak = { ...next.currentBreak, [playerId]: 0 };
  return { ...next, currentBreak, onBreakPlayerId: opponentId };
}

export function applyConcede(frame: Frame, concedingPlayerId: string, winnerId: string): Frame {
  const next = pushEvent(frame, 'concede', concedingPlayerId, 0);
  return { ...next, winnerId, completedAt: nowIso() };
}

export function completeFrame(frame: Frame, winnerId: string): Frame {
  return { ...frame, winnerId, completedAt: nowIso() };
}

/** Reconstructs each player's individual completed breaks from the event log —
 * the single source of truth for break/century stats (see scoring/stats.ts). */
export function deriveBreaks(frame: Frame): Record<string, number[]> {
  const breaks: Record<string, number[]> = {};
  const running: Record<string, number> = {};

  const flush = (playerId: string) => {
    const value = running[playerId] ?? 0;
    if (value > 0) {
      breaks[playerId] = breaks[playerId] ?? [];
      breaks[playerId].push(value);
    }
    running[playerId] = 0;
  };

  for (const event of frame.events) {
    if (event.type === 'pot') {
      running[event.playerId] = (running[event.playerId] ?? 0) + event.value;
    } else if (event.type === 'foul' || event.type === 'switch') {
      flush(event.playerId);
    }
  }
  Object.keys(running).forEach(flush);

  return breaks;
}

export function frameWinnerFromScores(frame: Frame): string | undefined {
  const entries = Object.entries(frame.scores);
  if (entries.length === 0) return undefined;
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}
