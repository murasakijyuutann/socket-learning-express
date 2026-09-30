# Watch-party platform — execution plan

Step-by-step tasks for each phase in [`watchparty_phases.md`](./watchparty_phases.md). Rules, schema and protocol come from [`watchparty_app_project-structure.md`](./watchparty_app_project-structure.md); this plan only says in which order to build them and how to check each piece.

Each step lists:
- **Before you start:** what has to be true first.
- **Tasks:** in order. Each task names the files it touches and ends in a check.
- **Verify:** the commands and manual checks that close the step, on top of the definition of done in the phases document.

Paths are relative to the repository root. `[ ]` boxes are meant to be ticked in pull requests.

## Starting point (2026-09-30)

- `server/` holds only the old `package.json` (Express, Socket.IO, `ws`, nodemon), `package-lock.json`, `.env`, `.env.example` and `node_modules/`. The old JavaScript server was deleted in commit `33cffe6`; for the TypeScript port in step 1, read it from the commit before: `git show 42ab038:server/index.js` (also `roomService.js`, `broadcast.js`, `test-client.js`).
- `client/` is empty.
- Tooling on the dev machine: Node 22.16, npm 10.9, Docker 28.

## Decisions this plan makes

These aren't spelled out in the structure document; they're chosen here so the steps are concrete. Change them here (and in the structure document) if you disagree.

| Topic | Choice | Why |
|---|---|---|
| Module format | ESM everywhere; `"moduleResolution": "Bundler"` | One setting for Vite, `tsx` and Vitest; no `.js` suffixes in imports |
| Shared package | Consumed as TypeScript source (`exports` → `src/index.ts`) | No build step for `shared` in dev or tests |
| Server runtime | `tsx watch` in dev; `tsup` bundles `server` + `shared` for production | Fast reloads; one output file to deploy |
| Styling | CSS Modules plus global CSS variables for the theme tokens | No extra framework; tokens map 1:1 to the theme sample |
| Fonts | `@fontsource` packages (Barlow Condensed 600, IBM Plex Sans 400/600, JetBrains Mono 600) | Self-hosted; no third-party font requests |
| Email | `nodemailer` over SMTP (Mailpit in dev) | Matches `.env` settings in the structure document |
| Passwords | `argon2` (argon2id) | As specified |
| Test database | `vitest` global setup runs `prisma migrate reset --force --skip-seed` on `TEST_DATABASE_URL`; DB test files run one at a time | Real Postgres behaviour, no cross-test interference |
| Health check | `GET /health` → `{ ok: true }` | Lets the proxy and tests confirm the server is up |
| Room list | `room:list` over the socket | Keeps the HTTP surface to `/auth/*` and `/health` |

---

## Phase 1: core MVP

### Step 0: Dev setup

**Before you start:** Docker Desktop is running. Nothing on ports 3000, 5173, 5432, 1025, 8025.

A copy-and-paste walkthrough of this step, with every file's contents, is in [`step-0-guide.md`](./step-0-guide.md).

**Tasks**

- [ ] **0.1 Clean the old server.** Delete `server/node_modules/`, `server/package-lock.json` and the old `server/package.json` (rewritten in 0.7). Keep `server/.env` for now (it's git-ignored); it's rewritten in 0.7.
- [ ] **0.2 Root workspace.**
  - `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["shared", "server", "client"]`.
  - Scripts:
    - `dev`: `concurrently -n server,client -c blue,magenta "npm:dev -w server" "npm:dev -w client"`
    - `build`: `npm run build -w server && npm run build -w client`
    - `test`: `npm run test --workspaces --if-present`
    - `lint`: `eslint .`
    - `format`: `prettier --write .`
    - `typecheck`: `npm run typecheck --workspaces --if-present`
    - `db:up`: `docker compose up -d`
    - `db:down`: `docker compose down`
    - `db:migrate`: `npm run db:migrate -w server`
    - `db:reset`: `npm run db:reset -w server`
    - `db:seed`: `npm run db:seed -w server`
  - Dev dependencies: `typescript`, `concurrently`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `prettier`, `eslint-config-prettier`.
  - Check: `npm install` at the root succeeds and creates one root `package-lock.json`.
- [ ] **0.3 TypeScript base.** `tsconfig.base.json`: `strict`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `resolveJsonModule`, `isolatedModules`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `skipLibCheck`, `forceConsistentCasingInFileNames`.
- [ ] **0.4 Repo hygiene.**
  - `.gitattributes`: `* text=auto eol=lf`.
  - `.prettierrc`: `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100, "endOfLine": "lf" }`; `.prettierignore` with `dist`, `coverage`, `*.png`, `*.pdf`, `docs/**/*.html`, `server/prisma/migrations`.
  - `eslint.config.js` (flat config): JS recommended + `typescript-eslint` recommended for all `.ts/.tsx`; React hooks and refresh rules for `client/`; Node globals for `server/`; `eslint-config-prettier` last. Ignore `dist`, `coverage`, `node_modules`.
  - `.gitignore`: add `coverage/`, `*.tsbuildinfo`.
- [ ] **0.5 Docker services.**
  - `docker-compose.yml`:
    - `postgres`: `postgres:16`, user/password/db `watchparty`, port `5432`, named volume, `./docker/postgres/init.sql` mounted into `/docker-entrypoint-initdb.d/`.
    - `mailpit`: `axllent/mailpit`, ports `1025` (SMTP) and `8025` (UI).
  - `docker/postgres/init.sql`: `CREATE DATABASE watchparty_test OWNER watchparty;`
  - Check: `npm run db:up`; `docker compose ps` shows both healthy; `http://localhost:8025` loads.
- [ ] **0.6 Shared package.**
  - `shared/package.json`: `"name": "@watchparty/shared"`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, dependency `zod`, dev dependency `vitest`, scripts `test: vitest run`, `typecheck: tsc --noEmit`.
  - `shared/tsconfig.json` extending the base.
  - `shared/src/index.ts` re-exporting `limits.ts` and `errors.ts` (empty-ish for now: `export const LIMITS = {} as const;`, `export const ERROR_CODES = [] as const;`).
  - `shared/src/limits.test.ts`: one test that `LIMITS` is frozen/defined.
- [ ] **0.7 Server package.**
  - `server/package.json`: `"type": "module"`, dependencies `ws`, `zod@4`, `@prisma/client@6`, `@watchparty/shared`; dev dependencies `prisma@6`, `tsx`, `tsup`, `vitest`, `@types/node@22`, `@types/ws`. `.env` is loaded with Node's built-in `--env-file` (no `dotenv`).
  - Scripts:
    - `dev`: `tsx watch --env-file=.env src/index.ts`
    - `build`: `tsup src/index.ts --format esm --target node22 --noExternal @watchparty/shared`
    - `start`: `node --env-file=.env dist/index.js`
    - `test`: `vitest run`
    - `typecheck`: `tsc --noEmit`
    - `db:migrate`: `prisma migrate dev`
    - `db:reset`: `prisma migrate reset --force`
    - `db:seed`: `tsx --env-file=.env prisma/seed.ts`
  - `server/tsconfig.json` extending the base, `types: ["node"]`.
  - `server/.env.example`: exactly the block from "Dev setup" in the structure document, plus `NODE_ENV=development`. Copy it to `server/.env` and fill in the admin values.
  - `server/src/config.ts`: zod schema for every `.env` value (`PORT` number, `DATABASE_URL` URL, `ALLOWED_ORIGINS` comma list, `SESSION_TTL_DAYS` number, `TRUST_PROXY` boolean, SMTP values, `TWITCH_PARENT_DOMAINS` list, admin values optional until step 2, `NODE_ENV` enum). Exits with a readable message listing the invalid keys.
  - `server/src/http/router.ts`: minimal router; `GET /health` → `200 { ok: true }`; everything else `404`.
  - `server/src/app.ts`: `createServer()` wrapping the router, so tests can listen on a random port without `.env`.
  - `server/src/index.ts`: load config, `createServer()`, listen on `config.PORT`, log the URL, close cleanly on `SIGINT`/`SIGTERM`.
  - `server/prisma/schema.prisma`: `generator client` + `datasource db` (postgresql, `env("DATABASE_URL")`), no models yet, written by hand (not `prisma init`). No Prisma client code until step 2 (`src/db.ts` and the test-database global setup arrive with the first models).
  - `server/vitest.config.ts`: `setupFiles: ['./test/setup.ts']`, `fileParallelism: false`.
  - `server/test/setup.ts`: loads `server/.env` with `process.loadEnvFile` (per-suite table truncation is added in step 2).
  - `server/test/health.test.ts`: starts the server on port 0, `GET /health` returns `{ ok: true }`, unknown paths `404`.
  - `server/test/db.test.ts`: `prisma db execute --url $TEST_DATABASE_URL` runs `SELECT 1` against the test database.
- [ ] **0.8 Client package.**
  - Scaffold with `npm create vite@latest client -- --template react-ts` (the folder is empty), then remove the demo content.
  - Dependencies: `react-router-dom`, `zustand`, `@watchparty/shared`, `@fontsource/barlow-condensed`, `@fontsource/ibm-plex-sans`, `@fontsource/jetbrains-mono`.
  - Scripts: `dev`, `build`, `preview`, `typecheck: tsc --noEmit`.
  - `client/vite.config.ts`: port `5173`; proxy `/auth` and `/health` → `http://localhost:3000`; `/ws` → `ws://localhost:3000` with `ws: true`.
  - `client/src/styles/tokens.css`: CSS variables from the theme sample — `--ground #0D1015`, `--surface #151A21`, `--raised #1C232C`, `--line #2A333F`, `--text #E9EDF2`, `--muted #97A3B3`, `--gold #F4B942`, `--side-a #5B9BFF`, `--side-b #FF9A55`, `--win #3DBE8B`, `--live #D93A40`; `--font-display` Barlow Condensed, `--font-body` IBM Plex Sans, `--font-num` JetBrains Mono.
  - `client/src/styles/global.css`: reset, `body` on `--ground` with `--font-body`.
  - `client/src/main.tsx` + `client/src/app/App.tsx`: router with one placeholder route that shows "WATCHPARTY" in the display font and the result of `fetch('/health')`.
- [ ] **0.9 README.** Replace the old README with: what the project is, prerequisites, the "Dev setup" commands, where the three docs are.

**Verify**
- [ ] `npm install && npm run db:up && npm run dev` → `http://localhost:5173` shows the placeholder with `ok: true` from `/health`.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all pass.
- [ ] `grep -E "express|socket.io|nodemon" server/package.json` finds nothing.

### Step 1: WebSocket core and chat

**Before you start:** step 0 merged. Read the old server (`git show 42ab038:server/index.js`, `roomService.js`, `broadcast.js`) for the join/leave/broadcast flow to port.

**Tasks**

- [ ] **1.1 Shared contract.**
  - `shared/src/messages/envelope.ts`: `ClientEnvelope = { action: string; requestId: string; payload: unknown }`; `ServerReply = { type: string; requestId: string; ... }`; `ServerBroadcast = { type: string; ... }`.
  - `shared/src/errors.ts`: `VALIDATION`, `UNKNOWN_ACTION`, `RATE_LIMITED`, `NOT_IN_ROOM`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL`; `ErrorReply = { type: 'error'; requestId; code; message }`.
  - `shared/src/limits.ts`: `WS_MAX_PAYLOAD = 16 * 1024`, `HEARTBEAT_MS = 30_000`, `HEARTBEAT_MISSES = 2`, `CHAT_MAX_CHARS = 300`, `CHAT_RATE = { count: 5, perMs: 5_000 }`, `CHAT_BUFFER = 100`.
  - `shared/src/domain/chat.ts`: `ChatMessage` discriminated by `kind` (`user`, `system` now; `event`, `game` declared for later), each with `seq`, `roomId`, `createdAt`.
  - `shared/src/schemas/room.ts` (`room:join { roomId }`), `shared/src/schemas/chat.ts` (`chat:send { text }`, trimmed, 1–300 chars).
  - `shared/src/messages/client.ts` and `server.ts`: typed unions for `room:join`, `chat:send`, `room:snapshot`, `chat:message`, `room:joined`, `error`.
  - Check: `npm run typecheck -w shared`.
- [ ] **1.2 Core types.** `server/src/ws/feature.ts`: `Feature { name; actions: Record<string, ActionHandler>; snapshot?(ctx); onJoin?(ctx); onLeave?(ctx) }`, `ActionHandler = { schema: ZodType; rateLimit?; handle(ctx, payload) }`, `Ctx { userId; roomId; socket; reply(); broadcast() }` (`tx` is added in step 5).
- [ ] **1.3 Registry.** `server/src/features.ts` lists the features; `buildRegistry(features)` maps `action → { feature, handler }` and throws on a duplicate action. Test: two features with the same action throw at startup.
- [ ] **1.4 Rooms and broadcast.** `server/src/ws/rooms.ts`: `Map<roomId, Set<Socket>>`, `join`, `leave`, `socketsOf(roomId)`, `closeUserSockets(userId)`. `server/src/ws/broadcast.ts`: `broadcastToRoom(roomId, message, except?)` skipping sockets whose `readyState` isn't `OPEN`.
- [ ] **1.5 Connection.** `server/src/ws/connection.ts`: attaches `userId`, `currentRoom`, `isAlive`; ping every 30 s, terminate after 2 missed pongs; on close → leave room, call features' `onLeave`.
- [ ] **1.6 Rate limit.** `server/src/ws/rate-limit.ts`: token bucket per socket per action, configured from `limits.ts`. Test: 6th chat in 5 s is refused, the bucket refills.
- [ ] **1.7 Dispatch.** `server/src/ws/dispatch.ts`: parse JSON (→ `VALIDATION`), check envelope, look up action (→ `UNKNOWN_ACTION`), rate-limit (→ `RATE_LIMITED`), validate payload with the handler's schema (→ `VALIDATION`), require a room for room-scoped actions (→ `NOT_IN_ROOM`), call the handler, catch unexpected errors (→ `INTERNAL`, logged). Every reply carries the `requestId`.
- [ ] **1.8 Snapshot and join.** `server/src/ws/snapshot.ts`: `room:join` → leave the previous room → add the socket to the new room **first** → collect `snapshot()` from every feature into `{ [featureName]: piece }` → send `room:snapshot`. Test: a chat message broadcast between "added to room" and "snapshot sent" is received exactly once (either in the snapshot or live, never both, never neither), using `seq` to de-duplicate on the client side.
- [ ] **1.9 Upgrade.** `server/src/ws/upgrade.ts`: on `'upgrade'` for path `/ws`: check `Origin` against `ALLOWED_ORIGINS` (→ 403), read `?dev=<name>` **only if `NODE_ENV === 'development'`** (dev identity; `userId = 'dev:<name>'`), otherwise 401; `wss.handleUpgrade` with `maxPayload`. Test: dev identity refused when `NODE_ENV` is `test` with the flag off; allowed when on.
- [ ] **1.10 Chat feature.** `server/src/features/chat/buffer.ts` (ring buffer of 100 per room, room `seq` counter), `server/src/features/chat/index.ts` (`chat:send` → append → broadcast `chat:message`; `snapshot` → the buffer; `commands/registry.ts` stub that treats `/...` as normal text for now). Tests: buffer wraparound keeps the newest 100 in order; `seq` strictly increases.
- [ ] **1.11 Wire the server.** `server/src/index.ts`: create `WebSocketServer({ noServer: true })`, attach upgrade handler, build the registry from `features.ts`.
- [ ] **1.12 Client socket.**
  - `client/src/lib/request-id.ts`: `crypto.randomUUID()`.
  - `client/src/lib/socket.ts`: connect to `/ws` (dev: `?dev=<name>`), exponential backoff (0.5 s → 10 s, jitter), typed `send(action, payload): Promise<Reply>` resolved by `requestId` with a timeout, `on(type, handler)`, rejoin the last room after reconnect.
  - `client/src/lib/store.ts`: Zustand store for connection state and chat (`messages` keyed by `seq`, keeps 100).
- [ ] **1.13 Client chat UI.** `client/src/features/room/RoomPage.tsx` (dev-name prompt, joins `/rooms/:roomId`), `client/src/features/chat/ChatPanel.tsx`, `ChatList.tsx`, `messages/UserMessage.tsx`, `messages/SystemMessage.tsx`, `useStickToBottom.ts`. User text is rendered as text only.
- [ ] **1.14 WebSocket integration tests.** `server/test/ws/`: helper that starts the server on port 0 and opens `ws` clients. Cover: join and chat between two clients, room isolation, late joiner gets the buffer, malformed JSON / unknown action / bad payload replies, oversize message closes the socket, missed pongs terminate the socket (fake timers).

**Verify**
- [ ] Two tabs (`?dev=kaz`, `?dev=ren`) in `/rooms/test` chat live; a third tab in `/rooms/other` sees nothing.
- [ ] Stop and start the server: tabs reconnect and rejoin on their own.
- [ ] `npm test` passes, including the concurrency test in 1.8.

### Step 2: Auth

**Before you start:** step 1 merged. Mailpit running.

**Tasks**

- [ ] **2.1 Schema and raw SQL.** Prisma models `User` (no `balance` yet), `Session`, `EmailToken`, `AuthEvent`, `SignupClaim`, `Flag`, `NicknameChange`, with the columns and `onDelete` rules from the structure document. Migration `init_auth`. A second raw SQL migration `ci_unique_login_nickname`: `CREATE UNIQUE INDEX ... ON "User" (lower("loginId"))` and the same for `nickname`. Check: `npm run db:migrate` applies both; `test/setup.ts` now truncates all tables between suites.
- [ ] **2.2 Shared auth contract.** `shared/src/schemas/signup.ts` (loginId `^[A-Za-z0-9]{4,20}$`, nickname `^[A-Za-z0-9]{2,16}$` and not `admin` in any case, email, password 8+), login, reset, find-id, change-email schemas. New error codes: `LOGIN_ID_TAKEN`, `NICKNAME_TAKEN`, `EMAIL_TAKEN`, `SIGNUP_COLLISION`, `EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`, `TOKEN_INVALID`, `BANNED`, `TOR_BLOCKED`. New limits: sign-up, availability, login, resend, change-email (values from "Protocol limits").
- [ ] **2.3 HTTP plumbing.** `server/src/http/router.ts`: method + path table, JSON body parser with a 16 KB cap, cookie parse/serialise, JSON responses, error mapping. `server/src/security/origin.ts` applied to every non-GET. `server/src/security/client-ip.ts` (trust `X-Forwarded-For` only when `TRUST_PROXY`; IPv6 → /64). A small in-memory rate limiter keyed by IP or account.
- [ ] **2.4 Security helpers.** `security/passwords.ts` (argon2id hash/verify), `security/email.ts` (trim, lowercase the domain), `security/tor-list.ts` (fetch the public exit list on start and hourly; `isTor(ip)`; a fixture file for tests), `abuse/flags.ts` (`raiseFlag`), `abuse/signals/shared-ip.ts`.
- [ ] **2.5 Mail.** `server/src/mail/send.ts` with `nodemailer` SMTP transport; templates for verify, reset and find-ID emails. Check: a test email appears in Mailpit.
- [ ] **2.6 Availability.** `http/auth/availability.ts`: `GET /auth/availability?field=&value=` → format check → existing account check (case-insensitive for loginId/nickname, exact normalized email) → `{ available }` or `{ invalid, reason }`. Rate-limited per IP. Tests for every rule in "Sign-up and availability checks".
- [ ] **2.7 Sign-up with collisions.** `http/auth/register.ts`: validate → Tor check → existing-account check → insert three `SignupClaim` rows (DB clock) → wait 1 s → look for claims on the same values from another `formToken` within 1 s (`ACTIVE` or `FAILED`) → if found: mark own claims `FAILED`, reply `SIGNUP_COLLISION` → else create the user in a transaction (unique indexes are the final word), delete own claims, record `AuthEvent SIGNUP`, run the shared-IP signal, send the verify email. Same `formToken` twice → the second request awaits and returns the first result (in-memory map of in-flight tokens). Sweeper deletes claims older than 1 minute. Tests: both fail at 0.5 s apart; first wins at 1.2 s apart; double-submit returns one result.
- [ ] **2.8 Verification, resend, change email.** `http/auth/verify-email.ts` (single-use hashed token, sets `emailVerifiedAt`; the sign-up grant hook is a no-op until step 5), resend (1/min, 10/day), `http/auth/change-email.ts` (unverified only, new address free, old `VERIFY` tokens marked used, new link sent).
- [ ] **2.9 Sessions, login, logout.** `http/auth/session.ts` (random id, stored hashed, `HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-day sliding; `lastSeenAt` written at most once per 5 minutes), `login.ts` (loginId + password, rate limits, `AuthEvent LOGIN` / `LOGIN_FAILED`, banned → refused, Tor → refused), `logout.ts`, `GET /auth/me` (user, verified flag, role).
- [ ] **2.10 Reset and find ID.** `password-reset.ts` (request → generic reply, email with single-use token; confirm → new hash, delete all sessions, `AuthEvent RESET`), `find-id.ts` (generic reply; emails the loginId).
- [ ] **2.11 Tickets.** `http/ws-ticket.ts`: session + verified + not banned + not Tor → 32-byte random ticket in `Map<ticket, { userId, expiresAt }>` (30 s). `ws/upgrade.ts`: redeem with get + delete in one synchronous step; remove the dev identity. Tests: single use, expiry, unverified refused.
- [ ] **2.12 Cleanup job.** `abuse/retention.ts`: hourly, delete users with `emailVerifiedAt IS NULL AND createdAt < now() - 24h` (cascades), and `AuthEvent` older than 90 days. Test with a shifted clock.
- [ ] **2.13 Admin seed.** `server/prisma/seed.ts`: upsert the admin from `ADMIN_LOGIN_ID` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`, nickname "Admin", role `ADMIN`, verified. Wire `"prisma": { "seed": ... }` in `server/package.json`.
- [ ] **2.14 Profiles.** `features/profiles/`: `display.ts` builds `DisplayProfile { userId, nickname }`; snapshot = profiles of users in the room; `onJoin` broadcasts the joiner's profile; `admin:rename_user` (admin only, same nickname rules, logs `NicknameChange`, broadcasts `user:profile_updated`).
- [ ] **2.15 Client auth.** `lib/api.ts` (fetch with `credentials: 'include'`), `lib/auth.ts` (current user via `/auth/me`), `lib/profiles.ts`, `components/Nickname.tsx`. `features/auth/`: `RegisterPage` (with `formToken` generated on load, top-of-page red banner), `AvailabilityField` + `useAvailabilityCheck` (unchecked / checking / available / taken / invalid; editing resets), `VerifyGate`, `VerifyEmail` landing, `Login`, `Logout`, `FindId`, `ResetPassword`. Route guard: not logged in → Login; unverified → VerifyGate. `socket.ts` fetches a ticket before each connect. Chat messages render names with `<Nickname>`.

**Verify**
- [ ] Full sign-up → Mailpit → verify → login → chat, in the browser.
- [ ] Every exit criterion of step 2 in the phases document, as automated tests where possible.
- [ ] `?dev=` no longer connects.

### Step 3: Rooms, presence and reconnect

**Before you start:** step 2 merged.

**Tasks**

- [ ] **3.1 Schema.** `Room` model with every column from the structure document (playback columns default to empty / paused). Migration `rooms`.
- [ ] **3.2 Rooms feature.** `features/rooms/index.ts`: `room:list`, `room:create` and `room:update` (admin only → `FORBIDDEN` otherwise; name 1–60 chars; source and link parsed into `source` / `sourceRef` / `isLive`). `room:join` now checks the room exists (`NOT_FOUND`).
- [ ] **3.3 Presence.** `features/rooms/presence.ts`: unique `userId`s per room computed from `rooms.ts`; broadcast `room:presence { watching }` on join/leave, coalesced to at most one per 2 s per room; included in the snapshot.
- [ ] **3.4 Reconnect contract.** Client store keeps the highest version per stream (chat `seq` now; others as they arrive). On reconnect: new ticket → connect → rejoin → apply snapshot → drop queued events older than the snapshot. Test: restart the server with two connected clients; both recover without duplicates.
- [ ] **3.5 Client.** `features/room/RoomList.tsx`, room page layout (player placeholder left, rail + chat right, "N watching"), header (logo, rooms link, nickname, logout). `features/admin/`: admin shell with tabs and the "Create a room" panel.

**Verify**
- [ ] Admin creates a room; a user sees it in the list and joins; "watching" updates in both tabs within 2 s.
- [ ] A user's `room:create` gets `FORBIDDEN`.

### Step 4: Playback

**Before you start:** step 3 merged.

**Tasks**

- [ ] **4.1 Shared.** `shared/src/domain/playback.ts` (`VideoSource`, `PlaybackState` with `playbackVersion`), schemas for `playback:load/play/pause/seek`, `shared/src/domain/time.ts` helpers.
- [ ] **4.2 Server.** `features/playback/state.ts` (read/write `Room` playback columns; every change bumps `playbackVersion` and sets `positionUpdatedAt` from the DB clock), `features/playback/index.ts` (admin-only actions, broadcast `playback:state`, snapshot piece). Every message carries `serverTime`.
- [ ] **4.3 Client clock.** `lib/server-clock.ts`: offset = `serverTime − Date.now()` from the snapshot and each state, smoothed.
- [ ] **4.4 Player.** `features/player/VideoPlayer.tsx`, `adapters/youtube.ts` (IFrame API loader, play/pause/seek/getCurrentTime), `usePlaybackSync.ts` (VOD: every 3 s compare with the expected position, seek if > 1.5 s off; ignore lower versions; live: just play). Badges: source + "In sync with Admin".
- [ ] **4.5 Admin controls.** Playback panel on the admin page: play/pause for everyone, −10 s / +10 s, load a different video.
- [ ] **4.6 Twitch.** `adapters/twitch.ts` (embed script, `parent` from `TWITCH_PARENT_DOMAINS` exposed through the snapshot or `/auth/me` config), live channel and VOD modes.

**Verify**
- [ ] Two users and the admin stay within 1.5 s through play, pause, seek and a late join (YouTube VOD, then Twitch VOD).
- [ ] Twitch live plays for everyone without sync.
- [ ] **Phase 1 exit** from the phases document, on a fresh database.

---

## Phase 2: centerpiece

### Step 5: Economy

**Before you start:** step 3 merged (step 4 can be in progress).

**Tasks**

- [ ] **5.1 Schema.** `User.balance Int @default(0)`, `LedgerTx` (auto-increment `BigInt` id, unique `(reason, refId)`), `LedgerEntry`, `DailyUse` (unique `(userId, kind, day)`). Migration `economy`.
- [ ] **5.2 Transaction helper.** `server/src/db.ts`: `withTx(fn, { timeoutMs = 15_000 })` using an interactive Prisma transaction; retry up to 3 times on `40P01` / `40001` with jitter. `Ctx` gains `tx`.
- [ ] **5.3 Ledger.** `economy/accounts.ts` (account id helpers, `houseBalance()` etc. by summing entries). `economy/ledger.ts`:
  - `post(tx, { reason, refId, entries })`: asserts entries sum to 0, locks affected user rows in ascending id order (`SELECT ... FOR UPDATE`), applies user balance changes, inserts `LedgerTx` + `LedgerEntry`; a duplicate `(reason, refId)` surfaces as an `ALREADY_POSTED` result, not an exception.
  - Checked debit: `UPDATE "User" SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance`; 0 rows → `INSUFFICIENT_BALANCE`, whole transaction rolls back.
  - `forcedDebit`: no balance check; only callable with reason `BET_PENALTY`.
  - Emits `balance:updated { balance, ledgerTxId }` to the user's sockets after commit.
- [ ] **5.4 Daily use.** `economy/daily-use.ts`: Tokyo day as `(now() AT TIME ZONE 'Asia/Tokyo')::date` from the DB; `claim(tx, userId, kind, refId)` (unique violation → `ALREADY_USED_TODAY`), `release(tx, userId, kind, day)`.
- [ ] **5.5 Sign-up grant.** Hook into verify-email: `SIGNUP_GRANT` 5,000 `HOUSE → USER`, `refId = user:<id>`, in the same transaction as setting `emailVerifiedAt`.
- [ ] **5.6 Lucky box.** `features/bonus/lucky-box.ts`: `bonus:open_lucky_box` → claim `LUCKY_BOX` → `crypto.randomInt(10, 10001)` → `LUCKY_BOX` `HOUSE → USER`, `refId = luckybox:<userId>:<day>`; reply with the amount; snapshot piece `{ availableToday, nextResetAt }`.
- [ ] **5.7 Reconcile.** `server/scripts/reconcile.ts`: every `User.balance` = sum of its `USER:<id>` entries; every settled/voided window's escrow = 0 (from step 6); exit code 1 on any mismatch. `server/test/teardown` runs it after the suite.
- [ ] **5.8 Client.** Balance chip in the header (negative in red), `features/bonus/LuckyBoxChip.tsx` ("Daily box ready" / next-box countdown), `LuckyBoxDialog.tsx` (reveals the server's amount).
- [ ] **5.9 Tests.** Sum-to-zero assertion, idempotent grant, checked debit rollback, forced debit limited to `BET_PENALTY`, crossing debits in parallel (100 iterations) never deadlock and reconcile, lucky box once per Tokyo day across the 00:00 JST boundary.

**Verify**
- [ ] New user verifies → 5,000; opens the box → balance updates live; second open refused.
- [ ] `npx tsx server/scripts/reconcile.ts` exits 0.

### Step 6: Betting windows

**Before you start:** steps 3 and 5 merged.

**Tasks**

- [ ] **6.1 Schema.** `BettingWindow`, `WindowOption` (with `code`, unique `(windowId, label)`, unique `(windowId, code)`, unique `(windowId, id)`), `Bet` (with `payout`, composite FK `(windowId, optionId)`), `PendingDoubleDown`. Raw SQL migration `one_open_window`: `CREATE UNIQUE INDEX ... ON "BettingWindow" ("roomId") WHERE status = 'OPEN'`.
- [ ] **6.2 Shared.** `domain/betting.ts`, schemas for `window:open/lock/extend/settle/void` and `bet:place`, messages `window:*`, `bet:placed`, `bet:accepted`, `bet:rejected`, `window:odds`; chat event kinds `double_down` and `window_opened`. Error codes `WINDOW_CLOSED`, `WINDOW_NOT_FOUND`, `ALREADY_BET`, `STAKE_OUT_OF_RANGE`, `DOUBLE_DOWN_UNAVAILABLE`, `ADMIN_CANNOT_BET`, `ILLEGAL_TRANSITION`, `WRONG_RESOLVER`. Limit `bet:place` 5 per 10 s, odds broadcast 1 per s.
- [ ] **6.3 Pure math (unit-tested first).** `features/betting/odds.ts` (odds per option from totals; display rounded down to 2 decimals), `payout.ts` math: `payout = floor(stake × m × pool / winningPool)` with integer arithmetic (`BigInt` for the product). Tests: 5,000 at 2.98x doubled → 29,800; one-sided pool → payout = stake × m; rounding never exceeds the exact value.
- [ ] **6.4 Window lifecycle.** `lock-window.ts` (`SELECT ... FOR UPDATE` via `tx.$queryRaw`), `transitions.ts` (conditional `UPDATE ... WHERE id = $1 AND status = $2`, bumps `version`, sets `lockedAt` / `resolvedAt`; illegal transitions → `ILLEGAL_TRANSITION`), `windows.ts` (open: ≥ 2 options, unique labels and codes, allowlisted colours, duration 10 s–10 min, `minStake ≤ maxStake`; extend +30 s while `OPEN`; posts the `window_opened` chat event). Test: two parallel opens in one room → one succeeds.
- [ ] **6.5 Auto-lock.** `timers.ts` (`Map<windowId, Timeout>` → lock at `closesAt`; cleared on lock/void), `sweeper.ts` (every 10 s: lock `OPEN` windows past `closesAt`; mark stale ones), startup rebuild from `OPEN` windows.
- [ ] **6.6 Bets.** `bets.ts` in one `withTx`: lock window → `OPEN` and DB `now() < closesAt` → option belongs to window → stake in range → admin check (`ADMIN_CANNOT_BET` on `ADMIN` windows) → checked debit `USER → ESCROW:window:<id>` (`BET_STAKE`) → if doubled: `DailyUse DOUBLE_DOWN` + `PendingDoubleDown` (unique `userId` → `DOUBLE_DOWN_UNAVAILABLE`) → insert `Bet` → bump `version`. After commit: `bet:accepted` to the bettor, `bet:placed` to the room, `double_down` chat event if doubled, schedule `window:odds`. Duplicate `(userId, requestId)` → return the stored bet with `replayed: true`. Tests: 20 bets racing auto-lock; replay; one bet per window; stake bounds; double-down twice in a day; admin refused.
- [ ] **6.7 Odds broadcast.** Per-window throttle: at most one `window:odds { totals, bettors, odds, version }` per second, always sending the latest state.
- [ ] **6.8 Settle.** `settle.ts` in one `withTx`: lock window → `LOCKED` → resolver matches `resolution` → winner belongs to window → if no bets on the winner, call the void path → else `BET_COLLECT` (all escrow → `HOUSE`), per winner `BET_PAYOUT` `HOUSE → USER` (`refId = window:<id>:user:<id>`), per doubled loser `BET_PENALTY` forced debit → write `payout` / `lossPenalty` on each bet → delete `PendingDoubleDown` rows → `LOCKED → SETTLED` with audit fields. Users locked in id order. Broadcast `window:settled` with per-user results sent privately. Tests: double settle pays once; wrong-window winner refused; escrow 0 after; reconcile passes.
- [ ] **6.9 Void.** `void.ts` in one `withTx`: lock window → `OPEN` or `LOCKED` → `BET_REFUND` per bet `ESCROW → USER` → delete the window's `DailyUse DOUBLE_DOWN` rows (by `refId`) and `PendingDoubleDown` rows → `→ VOID` → clear the timer. Tests: from `OPEN`, from `LOCKED`, and via no-winner settle; tickets returned; escrow 0.
- [ ] **6.10 Snapshot.** Betting piece: active window + options + totals + newest 50 bets (by `Bet.createdAt`) + the user's own bet + `version` + `serverTime`.
- [ ] **6.11 Client betting.** `features/betting/`: `useBettingWindow` (versioned state), `useBetDraft` (survives collapse), `BetRail`, `BettingBar` (every collapsed state), `BetPanel`, `OptionCard`, `StakeChips`, `DoubleDownToggle` ("Win 2× the return · lose 2× the stake", below-zero warning), `EstimatedReturn`, `SubmittedBet`, `ResultBanner` (net amounts), `Countdown` (last 10 s in red), `TeamTotals`, `BetFeed`; chat renderer for `double_down` and `window_opened` events via `<Nickname>`.
- [ ] **6.12 Client admin.** Betting windows page: open form (label + code + colour per option, presets and custom duration, min/max stake, allow double down), windows list with lock now / extend +30 s / cancel and refund / settle buttons, confirmation dialogs with the "Result copy" text, stale marker, stats (double-downs used today, points in escrow).

**Verify**
- [ ] Every step 6 exit criterion in the phases document passes as an automated test.
- [ ] **Phase 2 exit (the gate)** from the phases document, run by hand on a fresh database, then `reconcile.ts` exits 0.

---

## Phase 3: operations

### Step 7: Moderation, reports and flags

**Before you start:** the phase 2 gate has passed.

**Tasks**

- [ ] **7.1 Schema.** `ModerationAction`, `Report`. Migration `moderation`.
- [ ] **7.2 Server.** `features/moderation/index.ts`: `mod:mute` / `mod:kick` / `mod:ban` / `mod:unban` (admin only, reason required, logged); `guards.ts` checks active mutes in `chat:send`; `ban.ts` sets `bannedAt`, deletes sessions, `closeUserSockets`; login and ticket already refuse banned users. `report:create` copies the message (`messageId`, text, time, room) from the chat buffer at report time.
- [ ] **7.3 Admin pages.** Users (search, IP history from `AuthEvent`, accounts sharing an IP, balance, rename, mute/kick/ban), flags queue (dismiss / actioned, `reviewedBy`), reports queue, moderation log.
- [ ] **7.4 Client.** Report button on chat messages; muted state in the chat input.
- [ ] **7.5 Tests.** Mute expiry, ban closes sockets within a second and blocks login/ticket, report evidence survives a restart.

**Verify:** step 7 exit criteria in the phases document.

---

## Phase 4: expansion

Each step starts by writing its missing rules into the structure document, then follows the same pattern: schema → shared contract → server feature (registered in `features.ts`) → tests → client.

| Step | Key tasks | Key tests |
|---|---|---|
| 8. Transfers | `wallet:transfer` via `ledger.post` (`TRANSFER`, checked debit, `refId = transfer:<requestId>`), replay, rate limit, `NEW_ACCOUNT_TRANSFER` flag; Wallet page (balance, history from `LedgerEntry`, transfer dialog); move the lucky box into the Wallet page | Crossing transfers in parallel; negative receiver; replay; sender can't go below 0 |
| 9. Leaderboard | Ranking query by balance; `features/leaderboard` snapshot + periodic refresh | Matches ledger sums |
| 10. Shop | `ShopItem`, `Inventory`; purchase `USER → SHOP` in one transaction | Below-zero refused; replay |
| 11. Fantasy | Design first | From the design |

## Phase 5: future

Not planned in detail. Each item gets a design section in the structure document and a step in this plan before work starts.
