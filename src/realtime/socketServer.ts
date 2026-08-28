import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { ZodError, type ZodSchema } from 'zod';
import { prisma } from '../lib/prisma';
import { resolveAuthContext, type AuthContext } from '../lib/authContext';
import { matchChannelService } from '../services/matchChannelService';
import { env } from '../config/env';
import {
  cancelInviteSchema,
  concedeSchema,
  endFrameSchema,
  foulSchema,
  potSchema,
  respondInviteSchema,
  sendInviteSchema,
  switchSchema,
} from '../schemas';

/**
 * Socket.IO server implementing the Realtime / WebSocket contract in
 * docs/BACKEND.md. Client connects with a bearer token (handshake `auth.token`
 * or `?token=` query param); the server resolves it to a user id and joins the
 * socket to `user:<id>` plus a room per in-progress match it's part of.
 *
 * Unlike the mock's `on(event, handler)` escape hatch (needed there because
 * its in-process bus has no built-in scoping), a real client just calls
 * `socket.on('invite:new', handler)` / `socket.on('match:updated', handler)`
 * directly — Socket.IO rooms already guarantee a socket only ever receives
 * events emitted to rooms it has joined, so there's no separate subscription
 * API to implement server-side.
 *
 * Each `match:*`/`invite:*` action is request/response: the client passes an
 * ack callback and gets `{ ok: true, data }` or `{ ok: false, error }` back
 * immediately, in addition to (not instead of) the broadcast the action
 * triggers — this is what lets the sender's own UI update without waiting for
 * its own broadcast to round-trip, per docs/BACKEND.md.
 */

type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

function errorMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => i.message).join('; ');
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

function withAck<Payload, Result>(schema: ZodSchema<Payload>, handler: (auth: AuthContext, payload: Payload) => Promise<Result>) {
  return (auth: AuthContext) => async (rawPayload: unknown, ack?: Ack<Result>) => {
    try {
      const payload = schema.parse(rawPayload);
      const result = await handler(auth, payload);
      ack?.({ ok: true, data: result });
    } catch (err) {
      ack?.({ ok: false, error: errorMessage(err) });
    }
  };
}

const userRoom = (userId: string) => `user:${userId}`;
const matchRoom = (matchId: string) => `match:${matchId}`;

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.query?.token as string | undefined);
    resolveAuthContext(token)
      .then((auth) => {
        if (!auth) {
          next(new Error('unauthorized'));
          return;
        }
        socket.data.auth = auth;
        next();
      })
      .catch(next);
  });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as AuthContext;
    void onConnection(io, socket, auth);
  });

  return io;
}

async function onConnection(io: Server, socket: Socket, auth: AuthContext): Promise<void> {
  socket.join(userRoom(auth.userId));

  // "plus a room per active match it's part of" — sync the socket up with
  // whatever it missed while disconnected, same spirit as the REST
  // getPendingInvites/getMatch reads a client also does on reconnect.
  const inProgress = await prisma.match.findMany({ where: { status: 'in_progress' } });
  for (const row of inProgress) {
    if ((row.playerIds as string[]).includes(auth.userId)) {
      socket.join(matchRoom(row.id));
    }
  }

  socket.on(
    'invite:send',
    withAck(sendInviteSchema, async (a, { toUserId, matchTypeId }) => {
      const invite = await matchChannelService.sendInvite(a.userId, toUserId, matchTypeId);
      io.to(userRoom(toUserId)).emit('invite:new', invite);
      return invite;
    })(auth),
  );

  socket.on(
    'invite:respond',
    withAck(respondInviteSchema, async (a, { inviteId, accept }) => {
      const { invite, match } = await matchChannelService.respondToInvite(a.userId, inviteId, accept);
      if (!accept) {
        io.to(userRoom(invite.fromUserId)).emit('invite:declined', invite);
      } else if (match) {
        io.in(userRoom(invite.fromUserId)).socketsJoin(matchRoom(match.id));
        io.in(userRoom(invite.toUserId)).socketsJoin(matchRoom(match.id));
        io.to(userRoom(invite.fromUserId)).emit('invite:accepted', invite);
        io.to(userRoom(invite.toUserId)).emit('invite:accepted', invite);
      }
      return invite;
    })(auth),
  );

  socket.on(
    'invite:cancel',
    withAck(cancelInviteSchema, async (a, { inviteId }) => {
      const invite = await matchChannelService.cancelInvite(a.userId, inviteId);
      io.to(userRoom(invite.toUserId)).emit('invite:cancelled', invite);
      return invite;
    })(auth),
  );

  // Join `match:<id>` only *after* the service call succeeds (i.e. once
  // matchChannelService has confirmed this user is a participant) — joining
  // eagerly would let a non-participant's socket sit in a match room (and
  // keep receiving its broadcasts) even though their action was rejected.
  // Idempotent either way; this covers a solo match created via REST after
  // this socket already connected, which the initial connection-time join
  // (see onConnection above) can't have known about.
  socket.on(
    'match:pot',
    withAck(potSchema, async (a, { matchId, playerId, value }) => {
      const match = await matchChannelService.potBall(a.userId, matchId, playerId, value);
      socket.join(matchRoom(matchId));
      io.to(matchRoom(matchId)).emit('match:updated', match);
      return match;
    })(auth),
  );

  socket.on(
    'match:foul',
    withAck(foulSchema, async (a, { matchId, foulingPlayerId, value }) => {
      const match = await matchChannelService.foul(a.userId, matchId, foulingPlayerId, value);
      socket.join(matchRoom(matchId));
      io.to(matchRoom(matchId)).emit('match:updated', match);
      return match;
    })(auth),
  );

  socket.on(
    'match:switch',
    withAck(switchSchema, async (a, { matchId, playerId }) => {
      const match = await matchChannelService.switchPlayer(a.userId, matchId, playerId);
      socket.join(matchRoom(matchId));
      io.to(matchRoom(matchId)).emit('match:updated', match);
      return match;
    })(auth),
  );

  socket.on(
    'match:endFrame',
    withAck(endFrameSchema, async (a, { matchId, winnerId }) => {
      const match = await matchChannelService.endFrame(a.userId, matchId, winnerId);
      socket.join(matchRoom(matchId));
      io.to(matchRoom(matchId)).emit('match:updated', match);
      return match;
    })(auth),
  );

  socket.on(
    'match:concede',
    withAck(concedeSchema, async (a, { matchId, concedingPlayerId }) => {
      const match = await matchChannelService.concedeMatch(a.userId, matchId, concedingPlayerId);
      socket.join(matchRoom(matchId));
      io.to(matchRoom(matchId)).emit('match:updated', match);
      return match;
    })(auth),
  );
}
