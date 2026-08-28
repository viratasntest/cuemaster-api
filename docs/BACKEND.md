# CueMaster Backend Contract

> Copied verbatim from `cuemaster-ui/docs/BACKEND.md` for reference — this is
> the contract `cuemaster-api` implements. File links below (`src/services/api`,
> `src/types`, etc.) point into the **cuemaster-ui** repo, not this one; see
> [`../README.md`](../README.md) for how this repo's own layout maps onto it,
> including where it deviates.

This app is built entirely against the service interfaces in [`src/services/api`](../src/services/api).
Today those interfaces are implemented by an on-device mock (AsyncStorage + an
in-process pub/sub) in [`src/services/mock`](../src/services/mock) — see
[`src/services/index.ts`](../src/services/index.ts), the single file that wires
up which implementation is active. **Building a real backend means implementing
the endpoints/events below and swapping that one file** — no screen or hook
should need to change.

Everything here mirrors the TypeScript types in [`src/types`](../src/types).
Treat that folder as the source of truth for exact field names/shapes; this doc
describes how they travel over the wire.

## Auth model

- Bearer JWT (or equivalent) returned by signup/login, sent as
  `Authorization: Bearer <token>` on every subsequent request.
- The mock's `Session.token` is an opaque id today; a real backend should issue
  a signed JWT with a `sub` (user id) and `role` claim, and a `GET /auth/me` that
  resolves a token back into a `Session` — this is exactly what
  `AuthService.getSession()` does today by reading a persisted token.
- Passwords: the mock stores a SHA-256 hash purely so nothing plaintext sits in
  AsyncStorage. **Do not port this as-is** — use bcrypt/argon2 with a per-user
  salt server-side.

## Data models

| Type | Notes |
|---|---|
| `AppUser` = `PlayerProfile \| ClubProfile` | discriminated by `role` |
| `Session` | `{ user, token, expiresAt }` |
| `Friendship` | `{ id, requesterId, addresseeId, status, createdAt, respondedAt? }` |
| `MatchType` | reference data: `{ id, name, description, redBallCount, framesToWin, isSolo? }` |
| `MatchInvite` | `{ id, matchTypeId, fromUserId, toUserId, status, createdAt, respondedAt?, matchId? }` |
| `Match` | `{ id, matchTypeId, status, playerIds[], frames[], frameWins, winnerId?, createdAt, startedAt?, completedAt? }` |
| `Frame` | `{ id, matchId, frameNumber, scores, currentBreak, onBreakPlayerId, highestBreak, events[], winnerId?, completedAt? }` |
| `FrameEvent` | `{ id, frameId, type: 'pot'\|'foul'\|'switch'\|'concede', playerId, value, createdAt }` — the opponent for a `foul` is derived from `Match.playerIds`, not stored per-event |
| `CareerStats` | derived/aggregated, see "Stats derivation" below |

Full field types: [`src/types/user.ts`](../src/types/user.ts),
[`friend.ts`](../src/types/friend.ts), [`match.ts`](../src/types/match.ts),
[`stats.ts`](../src/types/stats.ts).

## REST endpoints

Maps to [`AuthService`](../src/services/api/authService.ts),
[`UserService`](../src/services/api/userService.ts),
[`FriendService`](../src/services/api/friendService.ts),
[`MatchService`](../src/services/api/matchService.ts),
[`StatsService`](../src/services/api/statsService.ts).

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup/player` | `PlayerSignupInput` | `Session` |
| POST | `/auth/signup/club` | `ClubSignupInput` | `Session` |
| POST | `/auth/login` | `LoginInput` | `Session` |
| POST | `/auth/logout` | — | 204 |
| GET | `/auth/me` | — | `Session \| 401` |

### Users
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/users/:id` | — | `AppUser \| 404` |
| PATCH | `/users/me` | `UpdateProfileInput` | `AppUser` |
| GET | `/users/search?q=&exclude=` | — | `PlayerProfile[]` (username prefix/contains match) |

### Friends
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/friends` | — | `FriendSummary[]` |
| GET | `/friends/requests` | — | `PendingFriendRequests` |
| POST | `/friends/requests` | `{ toUserId }` | `Friendship` |
| POST | `/friends/requests/:id/accept` | — | `Friendship` |
| POST | `/friends/requests/:id/decline` | — | `Friendship` |
| DELETE | `/friends/:friendshipId` | — | 204 |

### Matches (non-realtime)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/match-types` | — | `MatchType[]` |
| POST | `/matches/solo` | `{ matchTypeId }` | `Match` (starts immediately, no invite) |
| GET | `/matches/:id` | — | `Match \| 404` |
| GET | `/matches?userId=` | — | `Match[]`, newest first, in-progress and completed |

### Stats
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/users/:id/stats` | — | `CareerStats` |

## Realtime / WebSocket contract

This is the part that makes match invites and live-synced scoring actually work
across two physical devices — the mock (`mockRealtimeService.ts`) only delivers
these events within a single JS process, which is enough to develop and demo the
full flow, but **not** enough for two separate phones. A real backend needs a
WebSocket (or equivalent, e.g. Supabase/Firebase Realtime, Pusher, Ably) server
implementing the same [`RealtimeService`](../src/services/api/realtimeService.ts)
contract:

**Connection**: client connects with the bearer token (as a query param or the
initial handshake payload); server resolves it to a user id and subscribes the
socket to that user's personal channel/room (`user:<id>`) plus a room per active
match it's part of (`match:<id>`).

**Events emitted by the server** (payload shapes match `RealtimeEventMap` in
[`src/types/realtime.ts`](../src/types/realtime.ts)):

| Event | When | Payload |
|---|---|---|
| `invite:new` | someone invites this user to a match | `MatchInvite` |
| `invite:accepted` | either party's pending invite is accepted | `MatchInvite` (has `matchId`) |
| `invite:declined` | invitee declines | `MatchInvite` |
| `invite:cancelled` | inviter cancels before a response | `MatchInvite` |
| `match:updated` | after any scoring action, frame end, or match completion | full `Match` snapshot |

Sending the **full `Match` snapshot** on every update (rather than a diff) is a
deliberate simplification — matches are small, and it means a client that
missed events (backgrounded app, dropped connection) is fully correct again the
moment it receives the next one. It also matches exactly what `useLiveMatch`
already expects (see `queryClient.setQueryData(['match', matchId], updated)`).

**Actions sent by the client** (request/response, not fire-and-forget — each
should ack with the resulting object so the sender's own UI updates immediately
without waiting for its own broadcast to round-trip):

| Action | Payload | Server does |
|---|---|---|
| `invite:send` | `{ toUserId, matchTypeId }` | creates `MatchInvite`, emits `invite:new` to `user:<toUserId>` |
| `invite:respond` | `{ inviteId, accept }` | updates invite; if accepted, creates `Match` + first `Frame`, emits `invite:accepted` to both users |
| `invite:cancel` | `{ inviteId }` | marks cancelled, emits `invite:cancelled` to invitee |
| `match:pot` | `{ matchId, playerId, value }` | applies `applyPot` (see `src/utils/scoring.ts`), emits `match:updated` to `match:<id>` |
| `match:foul` | `{ matchId, foulingPlayerId, value }` | applies `applyFoul`, emits `match:updated` |
| `match:switch` | `{ matchId, playerId }` | applies `applySwitch`, emits `match:updated` |
| `match:endFrame` | `{ matchId, winnerId }` | closes the frame, advances to the next one or completes the match, emits `match:updated` |
| `match:concede` | `{ matchId, concedingPlayerId }` | ends the match immediately, emits `match:updated` |

**Reuse the scoring engine as-is.** `src/utils/scoring.ts` and
`src/utils/stats.ts` are pure functions with no storage/network dependency —
they were written so a Node backend can import the exact same file (or a direct
port) rather than re-implement snooker scoring rules server-side.

**Sync on reconnect**: `RealtimeService.match.getPendingInvites(userId)` is a
plain REST-shaped read a client calls on mount/reconnect to catch up on invites
it missed while disconnected — a real server should back it with a DB query
(`WHERE toUserId = ? AND status = 'pending'`), not rely on the socket layer
alone. The equivalent for an in-progress match is simply `GET /matches/:id`.

## Stats derivation

`CareerStats` is computed, not stored directly — `src/utils/stats.ts`
(`computeCareerStats`) walks a user's completed matches and, per frame,
reconstructs individual breaks from the event log (`deriveBreaks` in
`scoring.ts`) rather than trusting a single `highestBreak` field. A backend can
either replicate this logic in a query/cron job, or expose the same computation
as a plain endpoint (`GET /users/:id/stats`) backed by the identical function
run server-side over data pulled from the DB — again, the function has zero
storage dependencies, so it's directly reusable.

## Migrating off the mock

1. Implement the endpoints/events above.
2. Add `src/services/rest/*.ts` (REST) and `src/services/socket/realtimeService.ts`
   (WebSocket) implementing the same interfaces as the `mock/` versions.
3. Point `src/services/index.ts` at the new implementations (e.g. behind an env
   var so mock/real can be toggled per build).
4. Delete `bootstrapBackend`'s call site once seed data isn't needed, or keep it
   gated to dev builds only.
