import { Router } from 'express';
import { friendService } from '../services/friendService';
import { validateBody } from '../middleware/validate';
import { asyncHandler } from '../lib/asyncHandler';
import { sendFriendRequestSchema } from '../schemas';

export const friendsRouter = Router();

friendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const friends = await friendService.listFriends(req.auth!.userId);
    res.status(200).json(friends);
  }),
);

friendsRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const requests = await friendService.listPendingRequests(req.auth!.userId);
    res.status(200).json(requests);
  }),
);

friendsRouter.post(
  '/requests',
  validateBody(sendFriendRequestSchema),
  asyncHandler(async (req, res) => {
    const friendship = await friendService.sendFriendRequest(req.auth!.userId, req.body.toUserId);
    res.status(201).json(friendship);
  }),
);

friendsRouter.post(
  '/requests/:id/accept',
  asyncHandler(async (req, res) => {
    const friendship = await friendService.respondToFriendRequest(req.auth!.userId, req.params.id, true);
    res.status(200).json(friendship);
  }),
);

friendsRouter.post(
  '/requests/:id/decline',
  asyncHandler(async (req, res) => {
    const friendship = await friendService.respondToFriendRequest(req.auth!.userId, req.params.id, false);
    res.status(200).json(friendship);
  }),
);

friendsRouter.delete(
  '/:friendshipId',
  asyncHandler(async (req, res) => {
    await friendService.removeFriend(req.auth!.userId, req.params.friendshipId);
    res.status(204).end();
  }),
);
