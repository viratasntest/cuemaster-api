# CueMaster Backend Contract

> Copied verbatim from `cuemaster-ui/docs/BACKEND.md` for reference — this is
> the contract `cuemaster-api` implements. File links below (`src/services/api`,
> `src/types`, etc.) point into the **cuemaster-ui** repo, not this one; see
> [`../README.md`](../README.md) for how this repo's own layout maps onto it,
> including where it deviates.

This app is built entirely against the service interfaces in [`src/services/api`](../src/services/api).
[`src/services/index.ts`](../src/services/index.ts) — the single file that
decides which implementation is active — currently switches between an
on-device mock (AsyncStorage + an in-process pub/sub, in
[`src/services/mock`](../src/services/mock)) and a real REST + Socket.IO
backend (`src/services/rest`, `src/services/socket`), based on whether
`EXPO_PUBLIC_API_URL` is set. **cuemaster-api** (a sibling repo) implements
this contract already — the sections below marked with a request/response
table are new additions to that contract that still need implementing there;
everything else in this doc it already satisfies.

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
| POST | `/auth/social/:provider` | `{ token, role }` — see **Social Login** below | `Session` |
| POST | `/auth/logout` | — | 204 |
| GET | `/auth/me` | — | `Session \| 401` |

### Users
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/users/:id` | — | `AppUser \| 404` |
| PATCH | `/users/me` | `UpdateProfileInput` | `AppUser` |
| GET | `/users/search?q=&exclude=` | — | `PlayerProfile[]` (username prefix/contains match) |
| POST | `/users/me/avatar` | `multipart/form-data`, file field `avatar` — see **Avatar Upload** below | `AppUser` |

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

## Social Login (Google / Facebook)

Maps to `AuthService.loginWithSocial` (`src/services/api/authService.ts`).
The client sends a provider token it obtained via `expo-auth-session`'s
browser-based OAuth flow (`src/hooks/useGoogleAuth.ts` /
`useFacebookAuth.ts`) — **the server must independently verify that token**,
never trust the client's own claim of who it is.

### Endpoint

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/social/:provider` | `{ token: string, role: 'player' \| 'club' }` (`SocialLoginInput`, minus the `provider` field which is in the URL) | `Session` |

`:provider` is `google` or `facebook`. `role` is only used if this identity
needs a brand-new account created — ignored if one already exists.

### Server-side token verification

- **Google** — the client's `token` is an OpenID Connect `id_token`. Verify it
  properly, don't just decode the payload:
  - Preferred: verify the JWT signature against Google's JWKS using a library
    like `google-auth-library`'s `OAuth2Client.verifyIdToken({ idToken, audience: <your client id(s)> })`.
  - Simpler (one extra network round-trip, fine at this scale): `GET https://oauth2.googleapis.com/tokeninfo?id_token=<token>`
    and check the response's `aud` matches one of your configured client ids
    and `exp` hasn't passed. This is what the mock does client-side purely for
    dev convenience (`src/services/mock/socialProfile.ts`) — a real server
    must do the equivalent itself, not trust a client-side check of any kind.
  - Extract `sub` (Google's stable per-user id — this is the provider identity
    key), `email`, `email_verified`, `name`, `picture`.
- **Facebook** — the client's `token` is an `access_token` (Facebook's OAuth
  has no id_token equivalent). Verify it two ways:
  1. `GET https://graph.facebook.com/debug_token?input_token=<token>&access_token=<your_app_id>|<your_app_secret>` —
     confirm `data.is_valid` and `data.app_id` equals your Facebook App ID.
     This is what stops a token minted for a *different* app being replayed
     against yours.
  2. `GET https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=<token>`
     for the profile: `id`, `email` (may be absent — see below), `name`,
     `picture.data.url`.

### Find-or-create logic

1. Look up a linked identity by `(provider, providerId)`, where `providerId`
   is Google's `sub` or Facebook's `id`. If found, log in as that user.
2. Else, if the provider returned an `email`, look up an existing user by
   email. If found, **link** this provider identity to that account (so
   someone who signed up with a password can also use Google without a
   duplicate account) and log them in.
3. Else, create a new user with `role` from the request body:
   - `displayName` from the provider's name; `avatarUrl` from its picture.
   - `username` (players only — Google/Facebook have no concept of one),
     generated from the name/email and de-duplicated; mirror
     `generateUniqueUsername` in `src/services/mock/mockAuthService.ts` for
     the exact algorithm to match.
   - No `passwordHash` — this account can only log in via a linked provider
     until/unless you add a "set a password" flow later. `passwordHash` needs
     to become optional/nullable in the schema; `login()` (email/password)
     should fail with the normal "incorrect email or password" for such an
     account, not a 500.
   - Facebook sometimes omits `email` (declined permission, or none on file).
     Fall back to a synthetic placeholder like
     `facebook-<id>@no-email.cuemaster.app` (mirroring the mock) so email
     stays a usable unique key — or make email nullable and adjust
     uniqueness constraints; pick one and keep it consistent with the
     find-by-email path every other auth method already uses.
4. Issue a normal `Session` via the same session-creation path every other
   auth method uses (`createSessionForUser` in cuemaster-api's
   `authService.ts`).

### Schema addition

A new collection/model, e.g. `SocialIdentity`: `{ id, userId, provider: 'google' | 'facebook', providerId }`,
unique on `(provider, providerId)`, indexed on `userId`. Plus: `User.passwordHash`
becomes optional.

## Avatar Upload

Maps to `UserService.uploadAvatar` (`src/services/api/userService.ts`).

### Endpoint

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/users/me/avatar` | `multipart/form-data`, one file field named `avatar` | `AppUser` (with updated `avatarUrl`) |

### Server-side handling

- Parse with a multipart middleware (`multer` fits cuemaster-api's existing
  Express setup).
- Validate: reject anything that isn't `image/jpeg`, `image/png`, or
  `image/webp`; cap size (e.g. 5MB). The client already downsamples via
  `expo-image-picker`'s `quality: 0.7`, but never trust that alone.
- Store the file and set `User.avatarUrl` to a URL the client can load
  directly in an `<Image>` — this needs to be **publicly readable**, not
  behind the bearer-auth middleware every other route sits behind:
  - Simplest for local dev: save to disk under a directory served statically
    (`app.use('/uploads', express.static(...))`), return
    `${PUBLIC_BASE_URL}/uploads/<generated-filename>`.
  - Production-appropriate: upload to S3/Cloudinary/similar and store that
    provider's URL instead — swap the storage implementation only, the
    endpoint contract doesn't change.
- Delete/replace the previous avatar file when a user uploads a new one
  (skip if using a provider that already handles this, e.g. Cloudinary
  overwrite).
- Return the full updated `AppUser` (same shape `PATCH /users/me` returns),
  not just the URL — the client's `useAvatarUpload` hook writes the whole
  response straight into the session.

## Invite from Contacts

No backend endpoint needed for what's built today. `expo-contacts` +
`expo-sms` (`app/(player)/friends/invite-contacts.tsx`) are entirely
on-device: read the phone's contacts, open the native SMS composer
pre-addressed with an invite message and a download link
(`EXPO_PUBLIC_APP_DOWNLOAD_URL`). Nothing is sent to or tracked by the server.

If you later want referral tracking/rewards (e.g. "both accounts get
something once an invited contact signs up"), that's a separate addition —
not specced here since it wasn't asked for — but the natural shape is an
`invitedBy=<userId>` param on the download link, captured at signup.

## Stats derivation

`CareerStats` is computed, not stored directly — `src/utils/stats.ts`
(`computeCareerStats`) walks a user's completed matches and, per frame,
reconstructs individual breaks from the event log (`deriveBreaks` in
`scoring.ts`) rather than trusting a single `highestBreak` field. A backend can
either replicate this logic in a query/cron job, or expose the same computation
as a plain endpoint (`GET /users/:id/stats`) backed by the identical function
run server-side over data pulled from the DB — again, the function has zero
storage dependencies, so it's directly reusable.

## Adding a new capability to the contract

This is the checklist the Social Login / Avatar Upload sections above were
built from, for whatever gets added next:

1. Add/extend the type in `src/types` (the app's source of truth for field
   shapes) and mirror it into cuemaster-api's `src/types` (see that repo's
   README — the two are hand-kept in sync today, no shared package yet).
2. Add the method to the relevant `src/services/api/*.ts` interface.
3. Implement it in both `src/services/mock/*.ts` (so the app keeps working
   standalone, no backend required) and cuemaster-api's matching
   `src/services/*.ts` + `src/routes/*.ts`.
4. Implement the client side against the real API in `src/services/rest/*.ts`
   (or `src/services/socket/*.ts` for anything realtime).
5. Document the endpoint/event here, in this file, the way every other one
   above is documented — this doc is the contract; cuemaster-api's own
   README points back to it rather than duplicating it.
