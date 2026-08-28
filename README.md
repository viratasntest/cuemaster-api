# cuemaster-api

The real backend for [CueMaster](../cuemaster-ui) — implements every endpoint
and realtime event in [`docs/BACKEND.md`](docs/BACKEND.md) (copied here
verbatim from the app repo; treat it as the contract this service must
satisfy). Point `cuemaster-ui`'s `src/services/index.ts` at REST/socket
clients built against this instead of the mock, and no screen or hook in the
app needs to change.

**Stack:** Node.js + TypeScript, Express (REST), Socket.IO (realtime),
Prisma + MongoDB (persistence), JWT + bcrypt (auth), Zod (validation).

## Why MongoDB

The app's own types model `Match.frames` as an array of `Frame` objects and
each `Frame` carries `scores`/`currentBreak` as `Record<string, number>` maps
— naturally document-shaped, and always read/written as a whole through the
pure scoring functions in `src/scoring/`. Storing that as a Mongo document
(rather than normalizing frames/events into relational tables) keeps the port
of the scoring engine exact and matches the realtime contract's own "always
broadcast the full snapshot" design. See the comments in
[`prisma/schema.prisma`](prisma/schema.prisma) for the rest of the shape.

## Setup

```bash
npm install
cp .env.example .env

# Start a local MongoDB (project-local, disposable — see below), or point
# DATABASE_URL in .env at your own instance (e.g. MongoDB Atlas).
npm run mongo:start

npm run prisma:push   # sync the schema (Mongo has no migration history — this is `db push`, not `migrate`)
npm run seed          # match types + two demo players (password: demo1234)
npm run dev           # REST + Socket.IO on :4000
```

`npm run mongo:start` runs [`scripts/dev-mongo.sh`](scripts/dev-mongo.sh),
which spins up a **project-local** `mongod` on port 27018 as a single-node
replica set (`rs0`) — separate from any system-wide MongoDB you might have
running for other projects, and stored in `.mongo-data/` (gitignored). It's a
replica set rather than standalone because Prisma's Mongo connector needs one
for transactions/upserts; any real deployment (Atlas included) already gives
you that by default. `npm run mongo:stop` shuts it down.

Verify it's up: `curl localhost:4000/health` → `{"ok":true}`.

## Environment variables

See [`.env.example`](.env.example) for the full list with explanations
(`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `SESSION_LENGTH_DAYS`,
`BCRYPT_ROUNDS`).

## Project layout

```
prisma/schema.prisma      Data model (see file comments for the Mongo-specific choices)
prisma/seed.ts             Match types + demo players
src/types/                 Mirrors cuemaster-ui/src/types — see "Shared types" below
src/scoring/                Ported verbatim from cuemaster-ui/src/utils/{scoring,stats}.ts
src/services/                DB-backed business logic (one file per domain)
src/routes/                  Express route handlers → thin wrappers over services/
src/realtime/socketServer.ts  Socket.IO server: auth, rooms, match/invite actions
src/middleware/               auth (bearer→session), validation (zod), error handling
src/lib/                      prisma client, jwt, password hashing, mappers, error types
test/                          Vitest tests for the scoring/stats port (not yet run — see below)
```

## Shared types

`src/types/` is a hand-maintained mirror of `cuemaster-ui/src/types` (same
for `src/scoring/scoring.ts` + `stats.ts`, ported from
`cuemaster-ui/src/utils/`) — these are two separate repos today, so there's no
single source of truth enforced by the compiler. If the app's types change,
update the mirrors here too. A natural follow-up once both repos stabilize:
extract `types/` and `scoring/`+`stats.ts` into a shared npm package (or a
monorepo) both repos depend on, so they can't drift.

## Deviations / additions beyond docs/BACKEND.md

The doc describes the contract; a few things it leaves unspecified or
explicitly flags as "don't port as-is" needed a concrete decision here:

- **`GET /match-invites/pending`** — not in the doc's REST endpoints table,
  but required by its own Realtime section, which says
  `RealtimeService.match.getPendingInvites(userId)` should be "a plain
  REST-shaped read... backed by a DB query, not the socket layer." This is
  that endpoint. Scoped to the authenticated caller (their own pending
  invites) rather than an arbitrary `?userId=`, since there's no reason
  another user's pending invites should be readable.
- **Passwords**: bcrypt (`src/lib/password.ts`), not the mock's unsalted
  SHA-256 — exactly what the doc says to do.
- **Auth**: signed JWT carrying `sub`/`role`/`jti`, where `jti` references a
  `Session` row — this is what makes `POST /auth/logout` actually revoke a
  token instead of just discarding it client-side (a stateless JWT alone
  can't be revoked before it expires). `GET /auth/me` re-signs a token for
  the same session/expiry rather than persisting the original JWT string.
- **Authorization added beyond the mock** (which trusted every argument
  because it was an in-process library call, not a network boundary): only
  the invitee can accept/decline a friend request or match invite, only the
  requester can cancel one, only a friendship's two parties can remove it,
  and every `match:*` realtime action requires the caller to be a match
  participant. `invite:send`'s `fromUserId` is taken from the authenticated
  socket, never from the client payload.
- **Socket.IO ack envelope**: each `match:*`/`invite:*` action acks with
  `{ ok: true, data }` or `{ ok: false, error }` — the doc requires an ack
  with "the resulting object" but doesn't specify the envelope shape; this is
  ours. See `src/realtime/socketServer.ts`.
- **Client-side subscriptions**: the mock's `RealtimeConnection.on(event,
  handler)` exists because its in-process event bus has no built-in scoping.
  A real Socket.IO client doesn't need an equivalent — it just calls
  `socket.on('invite:new', handler)` / `socket.on('match:updated', handler)`
  directly, since Socket.IO rooms already guarantee a socket only receives
  events emitted to rooms it has joined (`user:<id>`, `match:<id>`).
- **This repo is the server only.** Per `docs/BACKEND.md`'s step 2/3, the
  next step is adding `src/services/rest/*.ts` and
  `src/services/socket/realtimeService.ts` in `cuemaster-ui` implementing the
  same `AuthService`/`MatchService`/`RealtimeService`/etc. interfaces against
  this API, then flipping `src/services/index.ts` over — that UI-side adapter
  isn't part of this repo.

## Testing

`test/scoring.test.ts` and `test/stats.test.ts` cover the ported scoring
engine and stats derivation (`npm test`, via Vitest) — written this pass but
not yet run/verified; the REST + Socket.IO flows (signup, login, friend
requests with authorization checks, solo matches, and the full
invite→accept→pot→foul→endFrame→stats pipeline over real sockets) *were*
manually verified end-to-end against a live local MongoDB during development.
