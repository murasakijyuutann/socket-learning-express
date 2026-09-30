# Watch-party platform — project structure

**Stack:** Vite + React + TS (`client/`) · Node.js + TS with built-in `http` and the `ws` library (`server/`) · PostgreSQL + Prisma · npm workspaces

**Repository:** `socket-learning/`. This document is the only architecture document. Older docs (the AWS Lambda/DynamoDB setup and the earlier playback-sync map) were removed and are superseded.

**UI references:** the design mockups live in [`docs/watchpartySS/`](./watchpartySS/):
- [Viewer — watch room with live bet](./watchpartySS/Viewer%20—%20watch%20room%20with%20live%20bet@2x.png)
- [Bet window collapsed — chat takes the rail](./watchpartySS/Bet%20window%20collapsed%20—%20chat%20takes%20the%20rail@2x.png)
- [Bet window expanded — chat shrinks](./watchpartySS/Bet%20window%20expanded%20—%20chat%20shrinks@2x.png)
- [Admin — open and settle betting windows](./watchpartySS/Admin%20—%20open%20and%20settle%20betting%20windows@2x.png)
- [Theme sample](./watchpartySS/Theme%20sample@2x.png)
- [ERD — economy and betting](./watchpartySS/Watch-party%20ERD_%20economy%20and%20betting.png)

## Revisions

- 2026-09-29, design review: one betting model vocabulary, idempotent settlement, reconnect snapshots, no per-second countdown ticks, and auth earlier in the build order.
- 2026-09-29, extensibility review:
  - **Ledger:** double-entry, with a house account.
  - **Features:** registered in one list.
  - **Chat:** message kinds.
  - **Names:** a single `<Nickname>` renderer.
  - **Allowances:** generic daily allowances.
  - **Betting windows:** a `resolution` field.
- 2026-09-29, transaction review:
  - **Concurrency:** atomic debits, window row locks and one lock order.
  - **Data integrity:** composite option ownership.
  - **Retries:** idempotent replay.
  - **Settlement authority:** enforced by `resolution`.
  - **Commit–reveal:** derives results deterministically from the seed.
- 2026-09-29, double down: a 2× return boost (`stake × odds × 2` on a win, `stake × 2` on a loss, and the balance may go below 0). Only one unresolved double-down is allowed per user.
- 2026-09-29, accounts and security:
  - **Accounts:** a separate `loginId`, with email for recovery, and cookie sessions.
  - **Sign-up and access:** open sign-up with a verified email; Tor blocked; VPNs and shared IPs flagged, not blocked.
  - **Transfers:** point transfers allowed.
  - **Moderation:** report evidence snapshots and a resolution audit trail.
  - **Build:** split into phases.
- 2026-09-30, repo review:
  - **Layout:** the doc now starts from the real `socket-learning/` tree; the backend lives in `server/` and the frontend in `client/`.
  - **Permissions:** only the admin creates rooms, controls playback and opens betting windows.
  - **Video:** YouTube and Twitch sources.
  - **Starting points:** 5,000 on verification, plus a daily lucky box of 10 to 10,000 points.
  - **Protocol:** `requestId` echoed in every reply, CSRF protection, snapshot ordering, protocol limits, and odds throttling.
  - **Economy checks:** non-user account balances and reconciliation.
  - **Operations:** stuck windows, bet privacy, bans closing sockets, and the first-admin seed.
  - **Dev setup and tests.**
- 2026-09-30, sign-up and live bets:
  - **Live bets:** all bets, double-downs included, are visible live while a window is open, with a live bet feed and per-team totals.
  - **Nicknames:** permanent once chosen; only the admin can rename.
  - **Availability checks:** login ID, nickname and email each need a passing "Check availability" before sign-up is allowed.
  - **Double-down announcement:** `"<nickname> used double down on <option>!"` appears the moment a double-down bet is placed.
  - **Name rules:** login ID and nickname allow English letters and digits only; the nickname "Admin" is reserved (any letter case) for the admin account.
  - **Sign-up collisions:** two sign-ups claiming the same login ID, nickname or email less than 1 second apart both fail with `F'mglw'nafl throd n'gha`.
  - **Email:** only exact duplicates count; Gmail-variant flagging and `emailAbuseCanonical` are removed.

## Principles

1. **All points move through `server/src/economy/ledger.ts`.** Every movement is double-entry and sums to zero across accounts.
2. **Each feature owns its folder and is registered in one list** (`features.ts`). Adding a feature doesn't mean editing dispatch or snapshot code. Duplicate actions are rejected at startup, and snapshot pieces are namespaced by feature name.
3. **The server decides every outcome.** Clients only display results: countdowns, lucky boxes, dice rolls, race animations.
4. **Names are rendered in one place.** `<Nickname userId>` is the only component that draws a user's name, so cosmetics apply everywhere at once.
5. **Abstract on the second use, not the first.** Seams exist now, but the generic `rounds/` module is extracted only when horse racing arrives.
6. **One lock order everywhere.** Lock the window row first (if any), then user rows sorted by id, then insert ledger rows. This covers bet placement, lock, extend, settle, void, transfers and bonuses, so no two operations can deadlock. As a safety net, transactions retry on Postgres deadlock (`40P01`) and serialization (`40001`) errors.
7. **Prevent real harm, flag economy exploits.** Points are free and can't be cashed out, so exploits only hurt the leaderboard. Anything that can hurt the app, its infrastructure or real people is blocked.
8. **Friends-only administration.** One admin (the owner) creates rooms, controls playback and runs betting windows. Everyone else watches, chats and bets.

## System structure

```
┌──────────────────────────────────────────────┐
│  client/ — Vite + React + TS                 │
│  player (YouTube / Twitch) · chat · betting  │
│  lucky box · wallet · admin                  │
│  (later) shop · fantasy · games · cosmetics  │
└───────┬───────────────────────────┬──────────┘
        │ /auth/*  (cookie session) │ /ws?ticket=...  (wss:// in production)
        │ /auth/ws-ticket           │
┌───────▼───────────────────────────▼──────────┐
│  server/ — Node.js + TS, one process         │
│                                              │
│  http.createServer                           │
│   ├─ /auth/*    Origin check on every POST   │
│   ├─ /auth/ws-ticket  session → 30s ticket   │
│   └─ 'upgrade' → check Origin → redeem ticket│
│                  (atomic get + delete) → ws  │
│                                              │
│  ws/ core: connection · dispatch · snapshot  │
│    dispatch: parse → rate-limit → validate   │
│              → registry[action] → feature    │
│    every reply echoes the client's requestId │
│                                              │
│  features/: chat · playback · profiles ·     │
│    betting · bonus · wallet · moderation     │
│                                              │
│  economy/:  double-entry ledger              │
│  security/: client IP · Tor · passwords · CSRF
│  abuse/:    flags for the admin, never blocks│
│                                              │
│  in memory (single instance):                │
│    Map<roomId, Set<socket>>                  │
│    Map<roomId, ChatRingBuffer(100)>          │
│    Map<ticket, { userId, expiresAt }>        │
│    betting timers + 10s sweep                │
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│  PostgreSQL 16 + Prisma                      │
└──────────────────────────────────────────────┘
```

## File tree

The tree starts from the current repository. `(later)` marks folders that are created when that feature is built; they are listed so the seams are visible now.

```
socket-learning/
├── package.json                      # NEW: npm workspaces ["client", "server", "shared"]
│                                     #   scripts: dev, test, lint, db:up, db:migrate, db:seed
├── package-lock.json                 # moves to the root once workspaces are set up
├── tsconfig.base.json                # NEW: strict mode, shared compiler options
├── docker-compose.yml                # NEW: postgres:16 (dev + test DBs), mailpit
├── .gitignore
├── README.md                         # how to run: see "Dev setup" below
│
├── docs/
│   ├── watchparty_app_project-structure.md   # ★ this document
│   └── watchpartySS/                 # UI mockups and ERD images
│
├── shared/                           # NEW ★ message contract, used by both sides
│   ├── package.json                  # name "@watchparty/shared"
│   └── src/
│       ├── messages/                 # namespaced: <feature>:<verb>
│       │   ├── client.ts             # every client message: { action, requestId, payload }
│       │   │                         #   room:join, chat:send, playback:load/play/pause/seek,
│       │   │                         #   window:open/lock/extend/settle/void, bet:place,
│       │   │                         #   bonus:open_lucky_box, wallet:transfer
│       │   └── server.ts             # replies echo requestId: bet:accepted, bet:rejected,
│       │                             #   error { requestId, code, message }
│       │                             # broadcasts: room:snapshot, chat:message (seq),
│       │                             #   playback:state (playbackVersion),
│       │                             #   window:opened/extended/locked/settled/voided,
│       │                             #   bet:placed (instant, one per bet: nickname, pick,
│       │                             #   stake, doubled — feeds the live bet list),
│       │                             #   chat:message kind system for a double-down:
│       │                             #   "<nickname> used double down on <option>!",
│       │                             #   window:odds (per-team totals + odds,
│       │                             #   ≤ 1 per second per window),
│       │                             #   balance:updated (ledgerTxId), user:profile_updated
│       ├── errors.ts                 # error codes: INSUFFICIENT_BALANCE, WINDOW_CLOSED,
│       │                             #   LOGIN_ID_TAKEN, NICKNAME_TAKEN, EMAIL_TAKEN,
│       │                             #   SIGNUP_COLLISION,
│       │                             #   RATE_LIMITED, FORBIDDEN, VALIDATION, NOT_FOUND, …
│       ├── limits.ts                 # shared numbers (see "Protocol limits")
│       ├── schemas/                  # zod validators per message
│       │   └── signup.ts             # loginId: /^[A-Za-z0-9]{4,20}$/;
│       │                             #   nickname: /^[A-Za-z0-9]{2,16}$/, not "admin"
│       │                             #   (any case); email; password (8+ chars) —
│       │                             #   the same rules on the client and the server
│       └── domain/
│           ├── chat.ts               # ChatMessage = user | system | game (by kind)
│           ├── profile.ts            # DisplayProfile { userId, nickname, (later) cosmetics }
│           ├── playback.ts           # VideoSource YOUTUBE | TWITCH; PlaybackState
│           ├── betting.ts            # BettingWindow, WindowOption, Bet, WindowStatus, Resolution
│           ├── economy.ts            # account ids, LedgerReason
│           └── time.ts               # serverTime + closesAt → countdown helpers
│
├── client/                           # Vite + React + TS
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts                # dev proxy: /auth → :3000, /ws → :3000 (ws: true)
│   └── src/
│       ├── main.tsx
│       ├── app/                      # React Router routes, layout, providers
│       ├── lib/
│       │   ├── socket.ts             # native WebSocket: fetch ticket → connect,
│       │   │                         #   reconnect with backoff, typed send()/on(),
│       │   │                         #   matches replies to actions by requestId
│       │   ├── server-clock.ts       # offset = serverTime − Date.now()
│       │   ├── request-id.ts         # crypto.randomUUID() per action
│       │   ├── profiles.ts           # Map<userId, DisplayProfile>
│       │   ├── api.ts                # fetch wrapper (credentials: "include")
│       │   └── store.ts              # Zustand stores fed by socket events
│       ├── components/
│       │   ├── Nickname.tsx          # ★ the only way a name is rendered
│       │   └── ui/
│       └── features/
│           ├── auth/
│           │   ├── RegisterPage.tsx  # top-of-page error banner (red text)
│           │   ├── AvailabilityField.tsx  # input + "Check availability" button +
│           │   │                          #   green V / red X message
│           │   ├── useAvailabilityCheck.ts  # per field: unchecked | checking |
│           │   │                            #   available | taken | invalid;
│           │   │                            #   editing the field resets it
│           │   └── VerifyEmail, Login, Logout, FindId, ResetPassword pages
│           ├── room/
│           │   ├── RoomPage.tsx
│           │   ├── RoomList.tsx      # rooms the admin has created
│           │   └── useRoomSnapshot.ts   # applies room:snapshot on (re)connect
│           ├── player/
│           │   ├── VideoPlayer.tsx   # picks the adapter by source
│           │   ├── adapters/
│           │   │   ├── youtube.ts    # YouTube IFrame Player API
│           │   │   └── twitch.ts     # Twitch embed (live channel or VOD)
│           │   └── usePlaybackSync.ts   # VOD: drift check every 3s, seek if > 1.5s off;
│           │                            #   live: no position sync
│           ├── chat/
│           │   ├── ChatPanel.tsx     # fills whatever height the rail leaves
│           │   ├── ChatList.tsx      # keeps the last 100, renders what fits
│           │   ├── messages/         # one renderer per ChatMessage kind
│           │   └── useStickToBottom.ts
│           ├── betting/
│           │   ├── BetRail.tsx       # collapsed/expanded (client-only state)
│           │   ├── BettingBar.tsx
│           │   ├── BetPanel.tsx
│           │   ├── OptionCard.tsx
│           │   ├── StakeChips.tsx
│           │   ├── DoubleDownToggle.tsx  # "Win 2× the return · lose 2× the stake";
│           │   │                         #   warns when a loss would go below 0
│           │   ├── EstimatedReturn.tsx   # stake × est. odds (× 2 when doubled)
│           │   ├── SubmittedBet.tsx
│           │   ├── ResultBanner.tsx
│           │   ├── BetFeed.tsx       # live list of bets as they happen; double-downs
│           │   │                     #   are highlighted: "Kaz used double down on OBS!"
│           │   ├── TeamTotals.tsx    # live points and bettor count per option
│           │   ├── Countdown.tsx
│           │   ├── useBetDraft.ts
│           │   └── useBettingWindow.ts
│           ├── bonus/
│           │   └── LuckyBox.tsx      # daily box; the animation reveals the server's result
│           ├── wallet/               # balance, TransferDialog, history
│           ├── moderation/           # report button
│           ├── admin/                # rooms (create, set video source), playback controls,
│           │                         #   betting windows (open/lock/settle/void, stale list),
│           │                         #   users (IP history, shared-IP accounts),
│           │                         #   flags queue, transfers log, mute/kick/ban
│           ├── (later) leaderboard/
│           ├── (later) shop/
│           ├── (later) fantasy/
│           ├── (later) rail/ActivityRail.tsx
│           ├── (later) games/        # React.lazy per game: dice/, horse-race/
│           └── (later) cosmetics/
│
└── server/                           # Node.js + TS + ws (replaces the old JS code)
    ├── package.json                  # Express/Socket.IO dependencies removed
    ├── .env                          # local only, git-ignored
    ├── .env.example                  # see "Dev setup"
    ├── vitest.config.ts
    ├── prisma/
    │   ├── schema.prisma
    │   ├── seed.ts                   # creates the admin from ADMIN_LOGIN_ID /
    │   │                             #   ADMIN_EMAIL / ADMIN_PASSWORD in .env, with the
    │   │                             #   nickname "Admin" (bypasses the reserved-name rule)
    │   └── migrations/
    │       └── xxxx_one_open_window/
    │           └── migration.sql     # raw SQL partial unique index:
    │                                 #   UNIQUE (room_id) WHERE status = 'OPEN'
    ├── scripts/
    │   └── reconcile.ts              # checks every cached balance = ledger sum,
    │                                 #   every settled/voided escrow = 0
    ├── test/
    │   ├── setup.ts                  # resets the test DB between suites
    │   ├── economy/                  # ledger, atomic debit, lock order, forced debit
    │   ├── betting/                  # concurrent bets vs lock, replay, settle, void,
    │   │                             #   double down, PendingDoubleDown
    │   └── ws/                       # ticket redemption, snapshot ordering
    └── src/
        ├── index.ts                  # http.createServer + listen, start timers and sweepers
        ├── config.ts                 # reads and validates .env (zod)
        ├── db.ts                     # Prisma client; tx helper with 15s timeout and
        │                             #   retry on 40P01 / 40001
        ├── features.ts               # ★ registered features
        ├── http/
        │   ├── router.ts
        │   ├── auth/
        │   │   ├── availability.ts   # GET /auth/availability?field=loginId|nickname|email
        │   │   │                     #   &value=… → { available } or { invalid, reason };
        │   │   │                     #   validates the format first; rate-limited per IP
        │   │   ├── register.ts       # loginId + nickname + email + password + formToken;
        │   │   │                     #   see "Sign-up collisions": validate → claim the
        │   │   │                     #   three values → hold 1s → collision? both fail →
        │   │   │                     #   else create (DB unique indexes are the final word);
        │   │   │                     #   repeat submits with the same formToken return the
        │   │   │                     #   first submit's result; sign-up rate limit per IP;
        │   │   │                     #   Tor → reject; shared IP → flag
        │   │   ├── verify-email.ts   # single-use, expiring token; on first verification:
        │   │   │                     #   SIGNUP_GRANT 5,000 HOUSE→USER
        │   │   ├── login.ts          # loginId + password; rate limit; AuthEvent;
        │   │   │                     #   Set-Cookie session (HttpOnly, Secure in prod,
        │   │   │                     #   SameSite=Lax); banned → rejected
        │   │   ├── logout.ts
        │   │   ├── session.ts        # cookie → Session → user; expired/banned → 401
        │   │   ├── find-id.ts        # emails the loginId; generic reply either way
        │   │   └── password-reset.ts # single-use token; generic reply;
        │   │                         #   success deletes all of the user's sessions
        │   └── ws-ticket.ts          # valid session → single-use 30s ticket
        │                             #   (in-memory Map; fine for a single instance)
        ├── security/                 # prevention: things that are blocked
        │   ├── client-ip.ts          # trust X-Forwarded-For only from our proxy;
        │   │                         #   IPv6 → /64
        │   ├── origin.ts             # CSRF: state-changing HTTP requests and the ws
        │   │                         #   upgrade must come from an allowed Origin
        │   ├── tor-list.ts           # refreshes the public Tor exit list hourly
        │   ├── passwords.ts          # argon2id
        │   └── email.ts              # emailNormalized: trim + lowercase domain
        │                             #   (no Gmail dot/+alias handling)
        ├── mail/
        │   └── send.ts               # SMTP; Mailpit in dev, provider chosen at deploy time
        ├── ws/                       # core — no feature logic here
        │   ├── upgrade.ts            # check Origin; redeem ticket atomically
        │   ├── connection.ts         # ping every 30s, drop after 2 missed pongs;
        │   │                         #   cleanup on close
        │   ├── feature.ts            # Feature { name, actions, snapshot?(ctx),
        │   │                         #   onJoin?, onLeave? }; ctx = { userId, roomId, tx }
        │   ├── dispatch.ts           # parse → rate-limit → validate → registry[action];
        │   │                         #   replies always echo requestId
        │   ├── snapshot.ts           # room:join → add socket to room FIRST, then read
        │   │                         #   the snapshot, so no event falls in between;
        │   │                         #   the client drops anything older than the snapshot
        │   ├── rate-limit.ts         # per-socket token buckets, limits per action
        │   ├── rooms.ts              # Map<roomId, Set<socket>>; closeUserSockets(userId)
        │   └── broadcast.ts          # broadcastToRoom + readyState check
        ├── economy/                  # ★ the only code that moves points
        │   ├── ledger.ts             # double-entry tx; checked debit
        │   │                         #   (UPDATE … WHERE balance >= $1); forcedDebit
        │   │                         #   (double-down penalty only)
        │   ├── accounts.ts           # USER:<id> (cached User.balance) · HOUSE ·
        │   │                         #   ESCROW:<ref> · SHOP (computed from ledger sums)
        │   └── daily-use.ts          # DailyUse(userId, kind, day), Tokyo calendar date
        ├── features/
        │   ├── chat/                 # chat:send (≤ 300 chars); ring buffer of 100 with
        │   │                         #   room seq; stores userId; lost on restart;
        │   │                         #   commands/ registry for "/…" messages
        │   ├── rooms/
        │   │   └── index.ts          # room:create/update (admin only): name, video source
        │   ├── playback/
        │   │   ├── index.ts          # playback:load/play/pause/seek (admin only)
        │   │   └── state.ts          # Room.source/sourceRef/isLive/isPlaying/
        │   │                         #   positionSec/positionUpdatedAt/playbackVersion
        │   ├── profiles/             # snapshot = profiles of users in the room;
        │   │                         #   nicknames are permanent; admin:rename_user
        │   │                         #   (admin only, logged) is the only way to change one
        │   ├── betting/
        │   │   ├── index.ts          # window:* (admin only), bet:place;
        │   │   │                     #   snapshot = activeWindow + myBet
        │   │   ├── windows.ts        # open (one OPEN per room; ≥ 2 options, unique
        │   │   │                     #   labels, allowlisted colours); extend while OPEN
        │   │   ├── lock-window.ts    # SELECT … FOR UPDATE (tx.$queryRaw)
        │   │   ├── transitions.ts    # conditional status updates; bump window.version
        │   │   ├── timers.ts         # auto-lock at closesAt
        │   │   ├── sweeper.ts        # every 10s: lock OPEN windows past closesAt;
        │   │   │                     #   mark LOCKED windows older than 24h as stale
        │   │   ├── bets.ts           # lock window → OPEN and now() < closesAt → option
        │   │   │                     #   belongs to window → checked debit USER→ESCROW →
        │   │   │                     #   if doubled: DailyUse + PendingDoubleDown →
        │   │   │                     #   insert bet → version++ → broadcast bet:placed
        │   │   │                     #   (+ the double-down chat message if doubled);
        │   │   │                     #   duplicate requestId →
        │   │   │                     #   original result with replayed: true
        │   │   ├── odds.ts           # pool totals → odds; broadcast ≤ 1/s per window
        │   │   ├── payout.ts         # base = floor(stake × pool / winningPool);
        │   │   │                     #   bonus = base if doubled (HOUSE→winner);
        │   │   │                     #   doubled loser penalty = stake (forcedDebit);
        │   │   │                     #   rounding remainder ESCROW→HOUSE
        │   │   ├── settle.ts         # resolver must match resolution; winner must belong
        │   │   │                     #   to the window; no winning bets → void path;
        │   │   │                     #   stores audit fields; users sorted by id
        │   │   └── void.ts           # ESCROW→owners, restore DailyUse, delete
        │   │                         #   PendingDoubleDown, no penalty
        │   ├── bonus/
        │   │   └── lucky-box.ts      # bonus:open_lucky_box: DailyUse LUCKY_BOX (Tokyo day)
        │   │                         #   → amount = crypto.randomInt(10, 10001)
        │   │                         #   → HOUSE→USER (reason LUCKY_BOX)
        │   ├── wallet/
        │   │   └── transfer.ts       # USER→USER, checked debit, rate-limited, replay;
        │   │                         #   large + new account → flag
        │   ├── moderation/
        │   │   ├── index.ts          # mod:mute/kick/ban (admin only), report:create
        │   │   └── ban.ts            # ban = delete sessions + closeUserSockets +
        │   │                         #   block login and tickets
        │   ├── (later) shop/  fantasy/  leaderboard/
        │   ├── (later) rounds/       # extracted from betting with the 2nd timed-round game
        │   ├── (later) games/        # rng.ts (commit–reveal), dice/, horse-race/
        │   └── (later) cosmetics/
        ├── abuse/                    # detection: flagged, never blocked
        │   ├── flags.ts              # raiseFlag(kind, userId, evidence)
        │   ├── signals/
        │   │   ├── shared-ip.ts
        │   │   ├── new-account-transfer.ts
        │   │   ├── (later) vpn.ts
        │   │   └── (later) fingerprint.ts
        │   └── retention.ts          # deletes AuthEvent rows older than 90 days
        └── (later) jobs/
            ├── sync-matches.ts       # OpenDota results for EXTERNAL windows
            └── score-fantasy.ts
```

## Dev setup

```bash
npm install                 # installs all workspaces from the root
npm run db:up               # docker compose up -d  (postgres + mailpit)
npm run db:migrate          # prisma migrate dev
npm run db:seed             # creates the admin account from .env
npm run dev                 # server on :3000, client on :5173
npm test                    # vitest, against the test database
```

**`server/.env.example`**

```
PORT=3000
DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty
TEST_DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty_test
ALLOWED_ORIGINS=http://localhost:5173
SESSION_TTL_DAYS=30
TRUST_PROXY=false
SMTP_HOST=localhost
SMTP_PORT=1025              # Mailpit; its web UI is on :8025
MAIL_FROM=watchparty@localhost
ADMIN_LOGIN_ID=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

**Tests:** Vitest. The economy and betting tests run against a real Postgres test database, not mocks, because the point of those tests is locking and constraint behaviour. The concurrency tests fire parallel requests, for example 20 bets racing the auto-lock, or two users transferring to each other at the same moment.

**Lint and format:** ESLint + Prettier across all workspaces.

## Rooms and playback

| Rule | Decision |
|---|---|
| Who creates rooms | The admin only |
| Who controls playback | The admin only (load, play, pause, seek) |
| Who opens and settles betting windows | The admin only |
| Video sources | YouTube (videos and live streams) and Twitch (live channels and VODs) |
| Stored state | `source` (`YOUTUBE` / `TWITCH`), `sourceRef` (YouTube video id, Twitch channel or VOD id), `isLive`, `isPlaying`, `positionSec`, `positionUpdatedAt`, `playbackVersion` |
| VOD sync | The server stores the state; each client computes the expected position as `positionSec + (serverNow − positionUpdatedAt)` while playing, checks its player every 3s, and seeks if it's more than 1.5s off. There's no periodic server broadcast. |
| Live sync | Everyone watches the same channel, and there's no position sync. Live streams can't be seeked, and each viewer's stream delay differs slightly. |
| Ordering | Every `playback:state` carries `playbackVersion`; older states are ignored |

## Database (PostgreSQL)

| Table | Key fields and constraints |
|---|---|
| `User` | `loginId` (4–20 chars, English letters and digits), `nickname` (2–16 chars, English letters and digits, permanent), `emailNormalized` (unique, recovery), `emailVerifiedAt`, argon2id hash, `role` (`ADMIN` / `USER`), `balance` (`Int`, cached; can be negative), `bannedAt`. `loginId` and `nickname` are unique case-insensitively (unique indexes on `lower(...)`, added in a raw SQL migration). |
| `Session` | `id` (stored hashed), `userId`, `expiresAt` (30 days, sliding), `lastSeenAt`, `ip`, `userAgent`; deleted on logout, password reset and ban |
| `Room` | `name`, `createdById` (the admin), `source`, `sourceRef`, `isLive`, `isPlaying`, `positionSec`, `positionUpdatedAt`, `playbackVersion` |
| `LedgerTx` | `id` (auto-increment; also the ordering key for `balance:updated`), `reason` (`SIGNUP_GRANT` / `LUCKY_BOX` / `BET_STAKE` / `BET_PAYOUT` / `BET_BONUS` / `BET_PENALTY` / `BET_REFUND` / `ROUNDING` / `TRANSFER` / …), `refId`, `createdAt`; unique `(reason, refId)` |
| `LedgerEntry` | `txId`, `account` (`USER:<id>` / `HOUSE` / `ESCROW:<ref>` / `SHOP`), `amount`; the entries of a tx sum to 0 |
| `BettingWindow` | `roomId`, `question`, `status`, `resolution`, `closesAt`, `minStake`, `maxStake`, `allowDoubleDown`, `winnerOptionId`, `resolver`, `resolutionRef`, `resolvedByUserId`, `resolvedAt`, `version`; one `OPEN` per room (raw SQL partial index) |
| `WindowOption` | `windowId`, `label`, `color`, (later) `externalRef` for mapping to match results; unique `(windowId, id)`, unique `(windowId, label)` |
| `Bet` | `windowId`, `optionId`, `userId`, `stake`, `doubleDown`, `basePayout`, `bonusPayout`, `lossPenalty`, `requestId`; unique `(windowId, userId)`, unique `(userId, requestId)`; composite FK `(windowId, optionId) → WindowOption(windowId, id)` |
| `PendingDoubleDown` | `userId` (unique), `betId`; deleted on settle or void |
| `DailyUse` | `userId`, `kind` (`DOUBLE_DOWN` / `LUCKY_BOX` / …), `day` (Postgres `date`, Tokyo calendar), `refId`; unique `(userId, kind, day)` |
| `AuthEvent` | `userId`, `kind`, `ip` (IPv6 as /64), `userAgent`, `createdAt`; deleted after 90 days |
| `EmailToken` | `userId`, `purpose` (`VERIFY` / `RESET` / `FIND_ID`), `tokenHash`, `expiresAt`, `usedAt` |
| `Flag` | `kind`, `userId`, `evidence` (JSON), `status`, `reviewedBy` |
| `SignupClaim` | `field` (`LOGIN_ID` / `NICKNAME` / `EMAIL`), `valueKey` (lowercased login ID/nickname, normalized email), `formToken`, `claimedAt` (DB clock); unique `(field, valueKey, formToken)`; deleted when the sign-up finishes; rows older than 1 minute are swept |
| `NicknameChange` | `userId`, `oldNickname`, `newNickname`, `byAdminId`, `reason`, `changedAt` (audit log of admin renames) |
| `ModerationAction` | `userId`, `kind` (`MUTE` / `KICK` / `BAN`), `until`, `reason`, `byAdminId` |
| `Report` | `reporterId`, `targetUserId`, `reason`, `status`, plus an evidence snapshot: `roomId`, `messageId`, `messageText`, `messageCreatedAt`, `reportedAt` |
| *(later)* `Match`, `ShopItem` / `Inventory`, `FantasyTeam` / `FantasyPick`, `Item` / `Equipped`, `GameRound`, `RoomSettings` | see "Future features" |

`winnerOptionId` isn't a composite FK because Prisma maps that awkwardly. `settle.ts` checks that the winner belongs to the window, inside the locked transaction.

## Sign-up and availability checks

| Rule | Decision |
|---|---|
| Fields checked | **Login ID**, **nickname** and **email**, each with its own "Check availability" button |
| Result | Green V with "This login ID / nickname / email is available." or red X with "That login ID / nickname / email is already taken." Format problems show a red X with the reason (for example "2–16 characters"). |
| Duplicates | Login ID and nickname: case-insensitive ("Kaz" and "kaz" are the same). Email: exact address only (`emailNormalized`). Gmail variants such as `ka.z@gmail.com` are different addresses: they pass and are not flagged. |
| Editing after a check | Changing a field resets its check; it has to be checked again |
| Sign-up button | Blocked unless all three fields show a green V. The error appears at the top of the page in red. |
| Message: not all checked | "Please check the availability of every field before signing up." This one wins if some fields are unchecked and another failed. |
| Message: a check failed | "One of the checks didn't pass. Try a different login ID, nickname or email and check again." |
| Sign-up collisions | See "Sign-up collisions" below: under 1 second apart, both fail with `F'mglw'nafl throd n'gha`; 1 second or more apart, the first wins and the later one gets "already taken". |
| Nickname rules | 2–16 characters, English letters (A–Z, a–z) and digits (0–9) only. Nothing else: no spaces, symbols, `_`, Korean or Japanese. The only reserved nickname is "Admin" in any letter case ("admin", "ADMIN"); names that merely contain it, such as "AAdmin" or "123Admin", are allowed. The admin account is named "Admin" by the seed script. |
| Nickname changes | Permanent once chosen. Only the admin can rename a user (typos, offensive names); the new name follows the same rules, and every rename is logged in `NicknameChange`. |
| Login ID rules | 4–20 characters, English letters and digits only; case-insensitive. The login ID is private: it's never shown to other users. |

### Sign-up collisions

Two different people submitting sign-ups that share any of the three values (login ID, nickname or email) less than 1 second apart **both fail** with the message `F'mglw'nafl throd n'gha`, shown in red at the top of the page. If they're 1 second or more apart, the earlier sign-up succeeds and the later one gets the normal "That … is already taken." on the field.

| Step | What the server does |
|---|---|
| 1 | Validates the format and checks that none of the three values belongs to an existing account (normal "already taken" if one does) |
| 2 | Inserts a `SignupClaim` for each of the three values, stamped with the database clock |
| 3 | Waits 1 second |
| 4 | Looks for claims on the same values from a **different** `formToken` less than 1 second apart from its own. If any exist, deletes its own claims and fails with `SIGNUP_COLLISION`. The other request finds this claim in the same way and fails too. |
| 5 | Otherwise creates the account in a transaction (the unique indexes still decide any remaining race) and deletes its claims |

- **Same form, repeat submits:** the register page generates a `formToken` when it loads. A double-click sends the same token twice; the second request waits for and returns the first one's result, so a person can never collide with themselves.
- **Cost:** every sign-up takes about 1 second longer.
- **After a collision:** nothing was created, so both people can simply try again.

## Economy

| Rule | Decision |
|---|---|
| Starting points | **5,000**, granted `HOUSE → USER` (`SIGNUP_GRANT`) when the email is verified for the first time, not at sign-up, so unverified bot accounts get nothing |
| Daily lucky box | Once per user per Tokyo calendar day (`DailyUse` kind `LUCKY_BOX`). The server draws a uniform random whole number from **10 to 10,000** (`crypto.randomInt(10, 10001)`) and pays it `HOUSE → USER`. The client animation only reveals the server's result. The average is about 5,000 a day. |
| Lucky box when negative | Allowed; it's the main way to climb back above 0 |
| Non-user accounts | `HOUSE`, `ESCROW:<ref>` and `SHOP` have no stored balance; they're computed by summing `LedgerEntry`. `HOUSE` is expected to go negative, because it funds sign-up grants, lucky boxes and double-down bonuses. |
| Reconciliation | `server/scripts/reconcile.ts` checks that every `User.balance` equals its ledger sum and that every settled or voided window's escrow is 0. It runs in the test suite and can be run by hand. |
| Balance type | `Int` (up to about 2.1 billion) |

## Betting rules

| Rule | Decision |
|---|---|
| Who runs windows | The admin opens, locks, extends, settles and voids. Anyone verified can bet. |
| Bets per window | One per user, no edits after placing, one option only |
| Base return | `stake × odds`, where odds = total pool ÷ pool on the winning option (parimutuel). Shown as an estimate while open; final at lock. |
| Double down (2× return boost) | Win: `stake × odds × 2`. Lose: `stake × 2`. This is intentional: it doubles the whole return, not just the profit. The stake is deducted when placing; the second stake is a penalty at settlement. Only the stake counts in the pool. Once per Tokyo day (`DailyUse`), and only one unresolved double-down per user (`PendingDoubleDown`). Restored if the window is voided. |
| Placing a double-down bet | Needs `balance ≥ stake`, the same as a normal bet |
| Win example | 5,000 on a 3.98x side, doubled: base 19,900 from the pool, plus a 19,900 bonus from `HOUSE`, gives 39,800 returned |
| Loss example | Balance 6,000, 5,000 doubled and lost: 6,000 − 10,000 = −4,000 |
| Negative balance | Shown as a negative number. A user below 0 can't bet, transfer or buy until the balance is back above 0. The lowest possible balance is −`maxStake`. |
| Max stake | Applies to the stake the user pays |
| Money flow | Stake `USER → ESCROW`. Settle: base `ESCROW → winners`, bonus `HOUSE → doubled winners`, penalty `doubled losers → HOUSE`, rounding `ESCROW → HOUSE`. Void: `ESCROW → owners`. |
| Exact odds | Payouts use the exact pool ratio, not the rounded odds on screen |
| No winning bets | Settlement takes the void path, and everyone is refunded |
| Open windows | At most one `OPEN` per room, enforced in the database |
| Stale windows | A window `LOCKED` for more than 24 hours is marked stale in the admin view. The admin settles or voids it; nothing is voided automatically. |
| Bet visibility | Always public, live. Each bet appears in the bet feed the moment it's accepted (`bet:placed`: nickname, pick, stake, doubled). When a bet uses double down, everyone immediately sees `"<nickname> used double down on <option>!"` (for example "Kaz used double down on OBS!") in the bet feed and as a system message in chat. Per-team point totals, bettor counts and odds refresh at most once a second (`window:odds`). Later bettors can follow the crowd; that's intended. |
| Time | The server/DB clock decides; clients get `serverTime` + `closesAt` once and count down locally |
| Settlement authority | `ADMIN`: admin handler only. `RNG`: game engine only. `EXTERNAL`: match-sync job only. |
| Concurrency | Window row, then user rows sorted by id, then ledger inserts. Checked debits. Retry on `40P01` / `40001`. Settlement transactions use a 15s timeout (Prisma's default is 5s). |
| Retries | A duplicate `(userId, requestId)` returns the original result with `replayed: true` |
| Reconnect | Window state is keyed by `(windowId, version)`. The version bumps on transitions and every accepted bet. Chat uses the room `seq`, balances use `ledgerTxId`, and playback uses `playbackVersion`. The client never moves backward. |
| Collapse state | Client-only UI; the bet draft survives collapse and expand |

## Protocol limits

| Limit | Value |
|---|---|
| WebSocket `maxPayload` | 16 KB |
| Heartbeat | Server ping every 30s; the socket is dropped after 2 missed pongs |
| Chat | 300 characters per message; 5 messages per 5s per socket |
| `bet:place` | 5 per 10s per user |
| `wallet:transfer` | 10 per minute per user |
| `window:odds` | At most 1 broadcast per second per window |
| Sign-up | 5 per hour per IP |
| Availability checks | 30 per 10 minutes per IP (all three fields together) |
| Login | 10 failures per 15 minutes per loginId and per IP |
| Error shape | `{ type: "error", requestId, code, message }`, with codes from `shared/src/errors.ts` |

These are starting values in `shared/src/limits.ts`; tune them once real usage shows what's too tight or too loose.

## Security and abuse policy

Points are free, can't be bought and can't be cashed out, so economy exploits only affect the leaderboard. They're flagged for the admin and tolerated. Anything that can harm the app, its infrastructure or real people is prevented.

| Risk | Response |
|---|---|
| Tor | **Blocked** at sign-up, login and ws ticket |
| Bot sign-ups | **Prevented:** sign-up rate limit, email verification, no points until verified |
| CSRF | **Prevented:** `SameSite=Lax` cookies plus an `Origin` allowlist check on every state-changing HTTP request and on the ws upgrade |
| Floods / overload | **Prevented:** the limits above |
| XSS | **Prevented:** user text is always rendered as text; cosmetics come from allowlists |
| Account takeover | **Prevented:** argon2id, login rate limits, single-use expiring email tokens, generic replies from login/reset/find-ID |
| Email enumeration | **Accepted:** the sign-up availability check reveals whether an email has an account. That's fine for a friends' app; the check is rate-limited so nobody can test emails in bulk. Find-ID and reset still reply generically. |
| Harassment | **Prevented:** admin mute/kick/ban and reports. A ban deletes sessions, closes open sockets, and blocks login and tickets. |
| Admin actions | **Prevented:** role checked on the server for every admin action. The first admin is created by `prisma/seed.ts`. |
| Shared IPs, VPNs | **Flagged**, not blocked |
| Private browsing | Not detected (can't be done reliably; harmless) |
| Alt accounts | **Flagged**, tolerated |
| Negative balances | Tolerated; bounded at −`maxStake`; recovered with the lucky box or transfers |

**IP data:** recorded at every sign-up and login, visible only to the admin, and deleted after 90 days. A short privacy notice explains this (IPs are personal data under Japan's APPI).

**Points stay play money:** no buying points and no redeeming them for money or goods, and real-money trading is forbidden in the rules. If points ever become purchasable, get legal advice on Japanese gambling law first.

## Point transfers

| Rule | Decision |
|---|---|
| Allowed | Yes, `wallet:transfer`, user to user |
| Money flow | `USER:sender → USER:receiver`, reason `TRANSFER` |
| Sender | Checked debit: can't go below 0 |
| Receiver below 0 | Allowed (friends bailing each other out) |
| Limits | Rate-limited; duplicate `requestId` replays the result |
| Visibility | Admin transfers log |
| Flags | Large transfers into or out of new accounts |

## Adding a feature later

1. Add the message types in `shared/src/messages/` and their schemas in `shared/src/schemas/`.
2. Create `server/src/features/<name>/index.ts` exporting a `Feature`.
3. Add it to `server/src/features.ts`. This is the only change to shared code.
4. Move points only through `server/src/economy/ledger.ts`, with a new `LedgerReason`.
5. Build the UI under `client/src/features/<name>/` and load it with `React.lazy`.
6. Use `<Nickname>` for names, and add a `ChatMessage` kind if the feature posts to chat.

## Future features: design notes

| Feature | Notes |
|---|---|
| Leaderboard | Ranks by balance, negative balances included. Transfers count as normal balance changes. |
| Shop and cosmetics | Purchases are `USER → SHOP`. `Item { type: BADGE / NAME_COLOR / FONT, data }` with allowlisted values; `Equipped(userId, slot)`. Equipping emits `user:profile_updated`. |
| Fantasy | Long-term leagues, separate from betting windows. Rules are still to be designed. |
| EXTERNAL windows | `jobs/sync-matches.ts` fetches OpenDota results; `WindowOption.externalRef` maps each option to a team or outcome. |
| Dice | `/dice` chat command using the committed-seed RNG, so every roll is verifiable; `USER ↔ HOUSE` |
| Horse racing | A betting round with `resolution = RNG`; the server fixes the finishing order and the client animates toward it. Extract `rounds/` here. |
| Provably fair | Publish `SHA-256(seed)` before bets; derive results with `HMAC-SHA256(seed, "<game>:<roundId>:<n>")`; reveal the seed after settlement. The lucky box doesn't claim this; it uses `crypto.randomInt`. |
| Right rail | `BetRail` becomes `ActivityRail` for whichever activity is live |
| Economy health | Watch `HOUSE` outflows: sign-up grants, lucky boxes (about 5,000 per user per day) and double-down bonuses. Shop purchases are the sink. Adjust the lucky-box range if points inflate too fast. |
| Multi-server (much later) | Room maps and tickets move to Redis; timers move to the DB sweeper with `SKIP LOCKED` |

## Build phases

Nothing past phase 2 is built until a watch party and a betting window work end to end.

**Phase 1: core MVP**
0. Dev setup: root workspaces, `shared/`, TypeScript, docker-compose, `.env.example`, Vite proxy, Vitest, ESLint. Remove the old Express/Socket.IO dependencies from `server/`.
1. `ws/` core (upgrade, dispatch with `requestId` echo, the feature registry, snapshot ordering) and chat with room `seq`, using a temporary dev identity. This is a TypeScript port of the earlier `socket-learning` server, reshaped as the first registered feature.
2. Auth: sign-up with the three availability checks, email verification (Mailpit), login and cookie sessions, logout, password reset, find ID, CSRF origin checks, `AuthEvent`, the Tor block, the ws ticket, the admin seed, and profiles with `<Nickname>`.
3. Rooms (admin creates them) and reconnect handling.
4. Playback: YouTube first, then Twitch.

**Phase 2: centerpiece**
5. Economy: the ledger, accounts, checked and forced debits, the lock order, the sign-up grant, the daily lucky box, and reconciliation.
6. Betting windows: open, lock, bets with replay, the live bet feed and team totals, odds throttling, settle, void, double down, stale-window view.

**Phase 3: operations**
7. Moderation (mute/kick/ban with socket close), reports, the admin flags queue.

**Phase 4: expansion**
8. Wallet transfers.
9. Leaderboard.
10. Shop.
11. Fantasy.

**Phase 5: future**
12. Chat commands and dice, horse racing, cosmetics, EXTERNAL windows, later abuse signals.
