# cuemaster-api

The real backend for [CueMaster](../cuemaster-ui) — implements every endpoint
and realtime event in [`docs/BACKEND.md`](docs/BACKEND.md) (copied here
verbatim from the app repo; treat it as the contract this service must
satisfy). `cuemaster-ui` already has REST/socket clients (`src/services/rest`,
`src/services/socket`) built against this API — set `EXPO_PUBLIC_API_URL` to
this server's URL there to use it instead of the on-device mock; no screen or
hook needs to change either way.

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
`BCRYPT_ROUNDS`, plus Social Login's `GOOGLE_CLIENT_IDS`/`FACEBOOK_APP_ID`/
`FACEBOOK_APP_SECRET` and Avatar Upload's `PUBLIC_BASE_URL`/`UPLOAD_DIR`/
`AVATAR_MAX_BYTES`). Social Login's provider-specific vars are optional —
leaving one unset makes that provider's endpoint return a clear "not
configured" error rather than failing at startup; Avatar Upload always works,
using sensible defaults.

## Project layout

```
prisma/schema.prisma      Data model (see file comments for the Mongo-specific choices)
prisma/seed.ts             Match types + demo players
src/types/                 Mirrors cuemaster-ui/src/types — see "Shared types" below
src/scoring/                Ported verbatim from cuemaster-ui/src/utils/{scoring,stats}.ts
src/services/                DB-backed business logic (one file per domain)
src/routes/                  Express route handlers → thin wrappers over services/
src/realtime/socketServer.ts  Socket.IO server: auth, rooms, match/invite actions
src/middleware/               auth (bearer→session), validation (zod), avatar upload (multer), error handling
src/lib/                      prisma client, jwt, password hashing, social-token verification, uploads, mappers, error types
uploads/                       Avatar files (gitignored — runtime data, see src/lib/uploads.ts)
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
- **This repo is the server only** — `cuemaster-ui`'s `src/services/rest/*.ts`
  and `src/services/socket/socketRealtimeService.ts` (built against this API,
  field-for-field) are the client half of the contract and live in that repo,
  switched on via `EXPO_PUBLIC_API_URL`.
- **Google/Facebook sign-in verification** uses the doc's "Simpler" option —
  Google's `tokeninfo` endpoint and Facebook's `debug_token` + `/me`, both a
  network round-trip rather than an offline JWKS check — since the doc calls
  that "fine at this scale". See `src/lib/socialAuth.ts` for the swap path to
  `google-auth-library`'s offline verification if you want it later.
- **Avatar storage** is local disk served statically (`app.use('/uploads',
  express.static(...))`, per the doc's "simplest for local dev" option) —
  `src/lib/uploads.ts` isolates the storage calls so swapping to S3/Cloudinary
  later only touches that one file, not the route/service contract. Note
  `PUBLIC_BASE_URL` must be a URL a *phone* can reach, not "localhost" — see
  `.env.example`.

## Testing

`test/scoring.test.ts` and `test/stats.test.ts` cover the ported scoring
engine and stats derivation (`npm test`, via Vitest) — written this pass but
not yet run/verified. Manually verified end-to-end against a live MongoDB
during development: signup, login, friend requests with authorization checks,
solo matches, and the full invite→accept→pot→foul→endFrame→stats pipeline
over real sockets; avatar upload (real file round-tripped byte-for-byte
through a real HTTP multipart request, old-file cleanup on re-upload, and the
wrong-type/oversized/wrong-field/unauthenticated rejection paths); and Social
Login's verification failure paths against Google's and Facebook's real
endpoints (not-configured, and a garbage token correctly rejected by each
provider) — the account-creation/linking success path isn't verifiable
without real OAuth app credentials and a live login flow, but mirrors the
already-proven mock implementation's logic exactly.
