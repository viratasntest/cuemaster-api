import { describe, expect, it } from 'vitest';
import { applyPot, completeFrame, createFrame } from '../src/scoring/scoring';
import { computeCareerStats } from '../src/scoring/stats';
import type { Match } from '../src/types';

const ME = 'me';
const OPP = 'opp';

function versusMatch(overrides: Partial<Match> = {}): Match {
  let frame = createFrame('match1', 1, ME);
  frame = applyPot(frame, ME, 7);
  frame = applyPot(frame, ME, 7); // 14-break for `me`
  frame = completeFrame(frame, ME);

  return {
    id: 'match1',
    matchTypeId: 'standard-snooker',
    status: 'completed',
    playerIds: [ME, OPP],
    frames: [frame],
    frameWins: { [ME]: 1, [OPP]: 0 },
    winnerId: ME,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeCareerStats (ported from cuemaster-ui/src/utils/stats.ts)', () => {
  it('ignores matches the user is not part of, in-progress matches, and solo matches for matchesPlayed', () => {
    const notMine = versusMatch({ id: 'x', playerIds: ['a', 'b'] });
    const inProgress = versusMatch({ id: 'y', status: 'in_progress' });
    const solo: Match = {
      id: 'solo1',
      matchTypeId: 'practice-solo',
      status: 'completed',
      playerIds: [ME],
      frames: [completeFrame(createFrame('solo1', 1, ME), ME)],
      frameWins: { [ME]: 1 },
      winnerId: ME,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const stats = computeCareerStats(ME, [notMine, inProgress, solo]);
    expect(stats.matchesPlayed).toBe(0); // solo matches (playerIds.length !== 2) don't count as "matchesPlayed"
    expect(stats.matchesWon).toBe(0);
    // But a solo match's completed frame still contributes to points/breaks.
    expect(stats.totalPointsScored).toBe(0); // the solo frame here has no pot events
  });

  it('counts a won 2-player match, its frame, and its break correctly', () => {
    const stats = computeCareerStats(ME, [versusMatch()]);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.matchesWon).toBe(1);
    expect(stats.framesPlayed).toBe(1);
    expect(stats.framesWon).toBe(1);
    expect(stats.totalPointsScored).toBe(14);
    expect(stats.highestBreak).toBe(14);
    expect(stats.averageBreak).toBe(14);
    expect(stats.centuries).toBe(0);
  });

  it('counts a lost match without incrementing matchesWon/framesWon', () => {
    let frame = createFrame('m2', 1, OPP);
    frame = applyPot(frame, OPP, 6);
    frame = completeFrame(frame, OPP);
    const lost = versusMatch({
      id: 'm2',
      frames: [frame],
      frameWins: { [ME]: 0, [OPP]: 1 },
      winnerId: OPP,
    });

    const stats = computeCareerStats(ME, [lost]);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.matchesWon).toBe(0);
    expect(stats.framesWon).toBe(0);
    expect(stats.framesPlayed).toBe(1);
    expect(stats.totalPointsScored).toBe(0); // `me` potted nothing in this frame
  });

  it('counts a century break and rounds averageBreak to 1 decimal', () => {
    let frame = createFrame('m3', 1, ME);
    for (let i = 0; i < 15; i++) frame = applyPot(frame, ME, 7); // 105-break
    frame = applyPot(frame, ME, 6); // +6 -> 111, still one break
    frame = completeFrame(frame, ME);
    const century = versusMatch({ id: 'm3', frames: [frame] });

    const stats = computeCareerStats(ME, [century, versusMatch()]); // 111-break + 14-break
    expect(stats.highestBreak).toBe(111);
    expect(stats.centuries).toBe(1);
    expect(stats.averageBreak).toBe(62.5); // (111 + 14) / 2
    expect(stats.matchesPlayed).toBe(2);
  });

  it('ignores frames that never completed', () => {
    let frame = createFrame('m4', 2, ME);
    frame = applyPot(frame, ME, 7); // mid-frame, no completedAt
    const withOpenFrame = versusMatch({ id: 'm4', frames: [versusMatch().frames[0], frame] });

    const stats = computeCareerStats(ME, [withOpenFrame]);
    expect(stats.framesPlayed).toBe(1); // only the completed frame counts
    expect(stats.totalPointsScored).toBe(14); // the open frame's 7 isn't counted
  });

  it('returns zeroed stats for a user with no completed matches', () => {
    const stats = computeCareerStats(ME, []);
    expect(stats).toMatchObject({
      userId: ME,
      matchesPlayed: 0,
      matchesWon: 0,
      framesPlayed: 0,
      framesWon: 0,
      highestBreak: 0,
      centuries: 0,
      totalPointsScored: 0,
      averageBreak: 0,
    });
  });
});
