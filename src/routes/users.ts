import { Router } from 'express';
import { userService } from '../services/userService';
import { validateBody } from '../middleware/validate';
import { avatarUpload } from '../middleware/avatarUpload';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../lib/errors';
import { updateProfileSchema } from '../schemas';

export const usersRouter = Router();

// Registered before the `/:id` route below so "me" and "search" aren't
// swallowed as a literal user id.
usersRouter.patch(
  '/me',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(req.auth!.userId, req.body);
    res.status(200).json(user);
  }),
);

usersRouter.post(
  '/me/avatar',
  avatarUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No avatar file provided — expected a multipart field named "avatar".');
    const user = await userService.saveAvatar(req.auth!.userId, req.file.filename);
    res.status(200).json(user);
  }),
);

usersRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : undefined;
    const results = await userService.searchPlayersByUsername(q, exclude);
    res.status(200).json(results);
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await userService.getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json(user);
  }),
);
