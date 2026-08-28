// Mirrors cuemaster-ui/src/types/stats.ts.

export interface CareerStats {
  userId: string;
  matchesPlayed: number;
  matchesWon: number;
  framesPlayed: number;
  framesWon: number;
  highestBreak: number;
  /** Count of individual breaks >= 100. */
  centuries: number;
  totalPointsScored: number;
  averageBreak: number;
  lastUpdated: string;
}
