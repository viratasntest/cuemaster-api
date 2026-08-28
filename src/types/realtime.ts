// Mirrors cuemaster-ui/src/types/realtime.ts.
import type { Match, MatchInvite } from './match';

/** Event contract for the realtime channel — the socket server emits exactly
 * these event names/payloads. See docs/BACKEND.md and src/realtime/. */
export interface RealtimeEventMap {
  'invite:new': MatchInvite;
  'invite:accepted': MatchInvite;
  'invite:declined': MatchInvite;
  'invite:cancelled': MatchInvite;
  /** Full match snapshot, sent after any score event, frame end, or completion. */
  'match:updated': Match;
}

export type RealtimeEventName = keyof RealtimeEventMap;
