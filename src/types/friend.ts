// Mirrors cuemaster-ui/src/types/friend.ts.
import type { PlayerProfile } from './user';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface FriendSummary {
  friendshipId: string;
  user: PlayerProfile;
  since: string;
}

export interface PendingFriendRequests {
  incoming: (Friendship & { fromUser: PlayerProfile })[];
  outgoing: (Friendship & { toUser: PlayerProfile })[];
}
