import { prisma } from '../lib/prisma';
import { toPlayerProfile } from '../lib/mappers';
import { ApiError } from '../lib/errors';
import type { Friendship, FriendSummary, PendingFriendRequests } from '../types';

function toFriendship(row: {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
}): Friendship {
  return {
    id: row.id,
    requesterId: row.requesterId,
    addresseeId: row.addresseeId,
    status: row.status as Friendship['status'],
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
  };
}

async function getPlayerRow(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export const friendService = {
  async listFriends(userId: string): Promise<FriendSummary[]> {
    const friendships = await prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    return Promise.all(
      friendships.map(async (f) => {
        const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
        const other = await getPlayerRow(otherId);
        return { friendshipId: f.id, user: toPlayerProfile(other), since: (f.respondedAt ?? f.createdAt).toISOString() };
      }),
    );
  },

  async listPendingRequests(userId: string): Promise<PendingFriendRequests> {
    const pending = await prisma.friendship.findMany({
      where: { status: 'pending', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    const incoming = pending.filter((f) => f.addresseeId === userId);
    const outgoing = pending.filter((f) => f.requesterId === userId);

    return {
      incoming: await Promise.all(
        incoming.map(async (f) => ({ ...toFriendship(f), fromUser: toPlayerProfile(await getPlayerRow(f.requesterId)) })),
      ),
      outgoing: await Promise.all(
        outgoing.map(async (f) => ({ ...toFriendship(f), toUser: toPlayerProfile(await getPlayerRow(f.addresseeId)) })),
      ),
    };
  },

  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<Friendship> {
    if (fromUserId === toUserId) throw ApiError.badRequest("You can't add yourself as a friend.");
    await getPlayerRow(toUserId);

    const existing = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: fromUserId, addresseeId: toUserId },
          { requesterId: toUserId, addresseeId: fromUserId },
        ],
      },
    });
    if (existing.some((f) => f.status === 'accepted')) throw ApiError.conflict('You are already friends.');
    if (existing.some((f) => f.status === 'pending')) throw ApiError.conflict('A friend request is already pending.');

    const row = await prisma.friendship.create({
      data: { requesterId: fromUserId, addresseeId: toUserId, status: 'pending' },
    });
    return toFriendship(row);
  },

  async respondToFriendRequest(userId: string, friendshipId: string, accept: boolean): Promise<Friendship> {
    const existing = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!existing) throw ApiError.notFound('Friend request not found');
    if (existing.addresseeId !== userId) throw ApiError.forbidden('Only the recipient can respond to this request.');
    if (existing.status !== 'pending') throw ApiError.conflict('This request is no longer pending.');

    const row = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: accept ? 'accepted' : 'declined', respondedAt: new Date() },
    });
    return toFriendship(row);
  },

  async removeFriend(userId: string, friendshipId: string): Promise<void> {
    const existing = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!existing) return; // already gone — DELETE is idempotent
    if (existing.requesterId !== userId && existing.addresseeId !== userId) {
      throw ApiError.forbidden('Not a party to this friendship.');
    }
    await prisma.friendship.delete({ where: { id: friendshipId } });
  },
};
