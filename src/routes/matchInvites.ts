import { Router } from 'express';
import { matchChannelService } from '../services/matchChannelService';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Not in docs/BACKEND.md's REST endpoints table, but required by its Realtime
 * section: "RealtimeService.match.getPendingInvites(userId) is a plain
 * REST-shaped read ... a real server should back it with a DB query ... not
 * rely on the socket layer alone." This is that DB-backed read, scoped to the
 * authenticated user (the invitee) rather than an arbitrary ?userId= since
 * there's no reason another user's pending invites should be world-readable.
 * See README.md's "Deviations from docs/BACKEND.md" section.
 */
export const matchInvitesRouter = Router();

matchInvitesRouter.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const invites = await matchChannelService.getPendingInvites(req.auth!.userId);
    res.status(200).json(invites);
  }),
);
