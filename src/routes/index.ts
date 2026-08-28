import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { statsRouter } from './stats';
import { friendsRouter } from './friends';
import { matchTypesRouter } from './matchTypes';
import { matchesRouter } from './matches';
import { matchInvitesRouter } from './matchInvites';

export const apiRouter = Router();

// Public: signup/login. Everything else requires a bearer token, per
// docs/BACKEND.md's auth model ("sent on every subsequent request").
apiRouter.use('/auth', authRouter);

apiRouter.use(requireAuth);
apiRouter.use('/users', usersRouter);
apiRouter.use('/users', statsRouter);
apiRouter.use('/friends', friendsRouter);
apiRouter.use('/match-types', matchTypesRouter);
apiRouter.use('/matches', matchesRouter);
apiRouter.use('/match-invites', matchInvitesRouter);
