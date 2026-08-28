import { describe, expect, it } from 'vitest';
import {
  applyConcede,
  applyFoul,
  applyPot,
  applySwitch,
  completeFrame,
  createFrame,
  deriveBreaks,
  frameWinnerFromScores,
  opponentOf,
} from '../src/scoring/scoring';

const P1 = 'p1';
const P2 = 'p2';

describe('scoring engine (ported from cuemaster-ui/src/utils/scoring.ts)', () => {
  it('opponentOf finds the other player, or undefined for solo matches', () => {
    expect(opponentOf({ playerIds: [P1, P2] }, P1)).toBe(P2);
    expect(opponentOf({ playerIds: [P1, P2] }, P2)).toBe(P1);
    expect(opponentOf({ playerIds: [P1] }, P1)).toBeUndefined();
  });

  it('applyPot accumulates score and running break, and stays on the potter', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 6);
    frame = applyPot(frame, P1, 7);
    expect(frame.scores[P1]).toBe(13);
    expect(frame.currentBreak[P1]).toBe(13);
    expect(frame.onBreakPlayerId).toBe(P1);
    expect(frame.highestBreak).toEqual({ playerId: P1, value: 13 });
    expect(frame.events).toHaveLength(2);
  });

  it('applyFoul awards points to the opponent, resets the fouling break, and passes the table', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 6);
    frame = applyFoul(frame, P1, P2, 4);
    expect(frame.scores).toEqual({ [P1]: 6, [P2]: 4 });
    expect(frame.currentBreak[P1]).toBe(0);
    expect(frame.onBreakPlayerId).toBe(P2);
  });

  it('applySwitch ends the break with no score change and passes the table', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 5);
    frame = applySwitch(frame, P1, P2);
    expect(frame.scores).toEqual({ [P1]: 5 });
    expect(frame.currentBreak[P1]).toBe(0);
    expect(frame.onBreakPlayerId).toBe(P2);
  });

  it('highestBreak only updates when a new break exceeds the recorded one', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 7); // p1 break: 7 (highest)
    frame = applySwitch(frame, P1, P2);
    frame = applyPot(frame, P2, 6); // p2 break: 6, does not beat 7
    expect(frame.highestBreak).toEqual({ playerId: P1, value: 7 });
    frame = applyPot(frame, P2, 2); // p2 break: 8, now beats 7
    expect(frame.highestBreak).toEqual({ playerId: P2, value: 8 });
  });

  it('applyConcede ends the frame immediately with the opponent as winner', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 6);
    frame = applyConcede(frame, P1, P2);
    expect(frame.winnerId).toBe(P2);
    expect(frame.completedAt).toBeDefined();
  });

  it('completeFrame just stamps a winner and completedAt', () => {
    const frame = completeFrame(createFrame('m1', 1, P1), P2);
    expect(frame.winnerId).toBe(P2);
    expect(frame.completedAt).toBeDefined();
  });

  it('deriveBreaks reconstructs individual completed breaks from the event log', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applyPot(frame, P1, 6); // break 6...
    frame = applyPot(frame, P1, 7); // ...+7 = 13
    frame = applySwitch(frame, P1, P2); // flush p1's 13
    frame = applyPot(frame, P2, 4);
    frame = applyFoul(frame, P2, P1, 4); // flush p2's 4
    frame = applyPot(frame, P1, 5); // p1 starts a new break of 5, never flushed (frame ends mid-break)

    const breaks = deriveBreaks(frame);
    expect(breaks[P1]).toEqual([13, 5]); // trailing running break is flushed at the end too
    expect(breaks[P2]).toEqual([4]);
  });

  it('deriveBreaks omits zero-value breaks (e.g. a switch/foul with nothing potted first)', () => {
    let frame = createFrame('m1', 1, P1);
    frame = applySwitch(frame, P1, P2); // nothing potted — no break recorded
    const breaks = deriveBreaks(frame);
    expect(breaks[P1]).toBeUndefined();
  });

  it('frameWinnerFromScores picks the higher score, and is undefined with no events', () => {
    let frame = createFrame('m1', 1, P1);
    expect(frameWinnerFromScores(frame)).toBeUndefined();
    frame = applyPot(frame, P1, 6);
    frame = applyFoul(frame, P1, P2, 7);
    expect(frameWinnerFromScores(frame)).toBe(P2); // 7 > 6
  });
});
