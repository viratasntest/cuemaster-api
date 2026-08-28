// Mirrors cuemaster-ui/src/types/match.ts.

/** A snooker variant players can start a match with. Data-driven so new variants
 * (e.g. "10-Red", "Timed Shootout") can be added later without new screens. */
export interface MatchType {
  id: string;
  name: string;
  description: string;
  /** 0 for practice-only variants that aren't red-ball based. */
  redBallCount: number;
  /** First player to win this many frames wins the match. */
  framesToWin: number;
  /** Solo variants skip the invite/accept flow entirely. */
  isSolo?: boolean;
}

export type MatchStatus = 'in_progress' | 'completed' | 'cancelled';

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

/** A challenge sent from one player to a friend. */
export interface MatchInvite {
  id: string;
  matchTypeId: string;
  fromUserId: string;
  toUserId: string;
  status: InviteStatus;
  createdAt: string;
  respondedAt?: string;
  /** Populated once accepted. */
  matchId?: string;
}

export type BallValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type FoulValue = 4 | 5 | 6 | 7;

export type FrameEventType = 'pot' | 'foul' | 'switch' | 'concede';

/**
 * A single scoring action. `playerId` is always the player the action is *about*
 * (who potted, who fouled, who ended their break, who conceded) — the opponent is
 * derived from `Match.playerIds` rather than duplicated on every event.
 */
export interface FrameEvent {
  id: string;
  frameId: string;
  type: FrameEventType;
  playerId: string;
  /** Ball/foul value; 0 for switch/concede. */
  value: number;
  createdAt: string;
}

export interface Frame {
  id: string;
  matchId: string;
  frameNumber: number;
  scores: Record<string, number>;
  /** Running (uncompleted) break per player, resets on foul/switch/frame end. */
  currentBreak: Record<string, number>;
  onBreakPlayerId: string;
  highestBreak: { playerId: string; value: number } | null;
  events: FrameEvent[];
  winnerId?: string;
  completedAt?: string;
}

export interface Match {
  id: string;
  matchTypeId: string;
  status: MatchStatus;
  /** [creator, opponent] for a friend match; length 1 for solo/practice. */
  playerIds: string[];
  frames: Frame[];
  frameWins: Record<string, number>;
  winnerId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
