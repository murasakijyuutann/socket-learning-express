# Watch-party platform — project structure

**Stack:** Vite + React + TS (frontend) · Node.js + TS with built-in `http` and the `ws` library (backend) · PostgreSQL + Prisma (DB)

**Revisions**
- 2026-09-29, design review: one betting model vocabulary, idempotent settlement, reconnect snapshots, no per-second ticks, and auth earlier in the build order.
- 2026-09-29, extensibility review: prepared for future entertainment features (horse racing, dice via chat commands, cosmetics such as badges, name colour and fonts). The changes are a double-entry ledger with a house account, registered features, chat message kinds, a single `<Nickname>` renderer, generic daily allowances, and a `resolution` field on betting windows.
- 2026-09-29, transaction review and double-down decision:
  - **Concurrency:** atomic balance debit, window row lock, and one lock order everywhere.
  - **Data integrity:** composite option ownership.
  - **Retries and reconnects:** idempotent replay on duplicate `requestId`, and state versions against stale snapshots.
  - **Settlement authority:** enforced by the window's `resolution`.
  - **Commit–reveal:** fixed to derive results deterministically from the seed.
  - **Double down:** double-or-nothing. A win pays 2× the return, with the bonus paid by `HOUSE`. A loss costs 2× the stake, with the extra taken as a penalty that may push the balance below 0.

- 2026-09-29, security and abuse policy:
  - **Sign-up:** open to anyone with a verified email.
  - **IP and user agent:** recorded at every sign-up and login.
  - **Tor:** blocked.
  - **VPNs, shared IPs and fingerprints:** flagged, not blocked.
  - **Point transfers:** allowed.
  - **Real harm:** prevented; economy exploits are only flagged.

## Principles

1. **All points move through `economy/ledger.ts`.** Every movement is double-entry and sums to zero across accounts.
2. **Each feature owns its folder and is registered in one list** (`features.ts`). Adding a feature does not mean editing dispatch or snapshot code. Duplicate actions are rejected at startup, and snapshot pieces are namespaced by feature name.
3. **The server decides every outcome.** Clients only display results: countdowns, dice rolls, race animations.
4. **Names are rendered in one place.** `<Nickname userId>` is the only component that draws a user's name, so cosmetics apply everywhere at once.
5. **Abstract on the second use, not the first.** Seams exist now, but the generic `rounds/` module is extracted only when horse racing arrives.
6. **One lock order everywhere: the window row first, then user balances.** Bet placement, lock, extend, settle and void all follow it, so they cannot deadlock each other.
7. **Prevent real harm, flag economy exploits.** Points are free and can't be cashed out, so exploits only hurt the leaderboard. Anything that can hurt the app, its infrastructure or real people is blocked.

## System structure

```
┌──────────────────────────────────────────────┐
│  FRONTEND — Vite + React + TS                │
│  player · chat · betting · shop · fantasy    │
│  (later) games · cosmetics  — lazy-loaded    │
└───────┬───────────────────────────┬──────────┘
        │ POST /auth/*              │ ws://?ticket=... (wss:// in production)
        │ POST /auth/ws-ticket      │
┌───────▼───────────────────────────▼──────────┐
│  BACKEND — Node.js + TS                      │
│                                              │
│  http.createServer                           │
│   ├─ /auth/login, /auth/register             │
│   ├─ /auth/ws-ticket  (single-use, 30s)      │
│   └─ 'upgrade' → check Origin → redeem ticket
│                  (atomic get+delete) → handleUpgrade
│                                              │
│  core (ws/): connection · dispatch · snapshot│
│    dispatch: parse → rate-limit → validate   │
│              → registry[action] → feature    │
│    snapshot: merge each feature's piece      │
│                                              │
│  features/: chat · playback · profiles ·     │
│             betting · wallet · moderation ·  │
│             shop · fantasy                   │
│             (later) games/dice, games/horse  │
│                                              │
│  economy/: double-entry ledger — the only    │
│            code that moves points            │
│  security/: client IP · Tor list · passwords │
│  abuse/:    flags for the admin, never blocks│
│                                              │
│  in memory: Map<roomId, Set<socket>>         │
│             Map<roomId, ChatRingBuffer(100)> │
│  timers + 10s sweep: auto-lock windows       │
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│  DATABASE — PostgreSQL + Prisma              │
│  users · rooms · ledger · betting · shop ·   │
│  daily uses · fantasy                        │
└──────────────────────────────────────────────┘
```

## File tree

`(later)` marks folders created when that feature is built. They are listed so the seams are visible now.

```
watchparty/
├── package.json                      # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── shared/                           # ★ message contract, used by both sides
│   └── src/
│       ├── messages/                 # namespaced: <feature>:<verb>
│       │   ├── client.ts             # every client message carries a requestId
│       │   │                         #   room:join, chat:send, playback:*,
│       │   │                         #   window:open/lock/extend/settle/void, bet:place
│       │   └── server.ts             # room:snapshot, chat:message,
│       │                             #   window:opened/extended/locked/settled/voided,
│       │                             #   window:odds, bet:accepted/rejected,
│       │                             #   balance:updated, user:profile_updated, error
│       │                             #   stateful messages carry `version`; clients
│       │                             #   ignore anything older than what they hold
│       ├── schemas/                  # zod validators per message
│       │   └── betting.ts
│       └── domain/
│           ├── chat.ts               # ChatMessage = user | system | game (discriminated by kind)
│           ├── profile.ts            # DisplayProfile { userId, name, (later) badge, nameColor, font }
│           ├── betting.ts            # BettingWindow, WindowOption, Bet, WindowStatus, Resolution
│           ├── economy.ts            # Account ids, LedgerReason
│           ├── playback.ts
│           └── time.ts               # serverTime + closesAt → countdown helpers
│
├── frontend/                         # Vite + React + TS
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── app/                      # router, layout, providers
│       ├── lib/
│       │   ├── socket.ts             # native WebSocket: fetch ticket → connect,
│       │   │                         #   reconnect with backoff, typed send()/on()
│       │   ├── server-clock.ts       # offset = serverTime − Date.now()
│       │   ├── request-id.ts         # crypto.randomUUID() per action
│       │   ├── profiles.ts           # Map<userId, DisplayProfile> from snapshot +
│       │   │                         #   user:profile_updated
│       │   └── auth.ts
│       ├── components/
│       │   ├── Nickname.tsx          # ★ the only way a name is rendered
│       │   │                         #   (badge, colour, font slot in later)
│       │   └── ui/
│       └── features/
│           ├── room/
│           │   ├── RoomPage.tsx
│           │   └── useRoomSnapshot.ts   # applies room:snapshot on (re)connect
│           ├── player/               # VideoPlayer, usePlaybackSync
│           ├── chat/
│           │   ├── ChatPanel.tsx     # fills whatever height the rail leaves
│           │   ├── ChatList.tsx      # keeps last 100, renders what fits
│           │   ├── messages/         # one renderer per ChatMessage kind
│           │   │   ├── UserMessage.tsx
│           │   │   ├── SystemMessage.tsx
│           │   │   └── GameMessage.tsx   # (later) dice result etc.
│           │   └── useStickToBottom.ts
│           ├── betting/
│           │   ├── BetRail.tsx       # collapsed/expanded (client-only);
│           │   │                     #   (later) becomes ActivityRail
│           │   ├── BettingBar.tsx
│           │   ├── BetPanel.tsx
│           │   ├── OptionCard.tsx
│           │   ├── StakeChips.tsx
│           │   ├── DoubleDownToggle.tsx  # "Win 2× the return · lose 2× the stake";
│           │   │                         #   warns when a loss would go below 0
│           │   ├── EstimatedReturn.tsx   # stake × est. odds (× 2 when doubled)
│           │   ├── SubmittedBet.tsx
│           │   ├── ResultBanner.tsx
│           │   ├── Countdown.tsx
│           │   ├── useBetDraft.ts
│           │   ├── useBettingWindow.ts
│           │   └── admin/
│           │       ├── OpenWindowForm.tsx
│           │       ├── WindowList.tsx
│           │       ├── SettleConfirmDialog.tsx
│           │       └── VoidConfirmDialog.tsx
│           ├── shop/
│           ├── fantasy/              # long-term leagues, separate from betting
│           ├── profile/
│           ├── auth/                 # Register, VerifyEmail, Login,
│           │                         #   FindId, ResetPassword pages
│           ├── wallet/               # TransferDialog, transaction history
│           ├── moderation/           # report button; admin mute/kick/ban
│           ├── admin/                # users (IP history, shared-IP accounts),
│           │                         #   flags queue, transfers log
│           ├── (later) rail/ActivityRail.tsx   # hosts whichever activity is live
│           ├── (later) games/        # React.lazy per game
│           │   ├── dice/
│           │   └── horse-race/       # animates toward a server-decided result
│           └── (later) cosmetics/    # inventory, equip slots
│
└── backend/                          # Node.js + TS + ws
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    │       └── xxxx_one_open_window/
    │           └── migration.sql     # raw SQL: partial unique index
    │                                 #   UNIQUE (room_id) WHERE status = 'OPEN'
    └── src/
        ├── index.ts                  # http.createServer + listen, start sweepers
        ├── config.ts
        ├── db.ts                     # Prisma client
        ├── features.ts               # ★ registered features: [chat, playback,
        │                             #   profiles, betting, shop, fantasy, …]
        ├── http/
        │   ├── router.ts
        │   ├── auth/
        │   │   ├── register.ts       # email + password; sign-up rate limit per IP;
        │   │   │                     #   Tor → reject; shared IP/VPN → flag
        │   │   ├── verify-email.ts   # single-use, expiring token; unverified accounts
        │   │   │                     #   can't open a socket
        │   │   ├── login.ts          # login rate limit; records AuthEvent
        │   │   ├── find-id.ts        # sends the account id to the verified email
        │   │   └── password-reset.ts # single-use, expiring reset token
        │   └── ws-ticket.ts          # /auth/ws-ticket: single-use, short-lived
        ├── security/                 # prevention: things that are blocked
        │   ├── client-ip.ts          # req.socket.remoteAddress; trust X-Forwarded-For /
        │   │                         #   CF-Connecting-IP only from our proxy; IPv6 → /64
        │   ├── tor-list.ts           # refreshes the public Tor exit list hourly
        │   ├── passwords.ts          # argon2id hash/verify
        │   └── email.ts              # normalize (lowercase; Gmail dots and +aliases)
        ├── ws/                       # core — no feature logic here
        │   ├── upgrade.ts            # check Origin; redeem ticket atomically (get + delete)
        │   ├── connection.ts         # register, heartbeat, cleanup on close
        │   ├── feature.ts            # Feature interface:
        │   │                         #   { name, actions, snapshot?(ctx), onJoin?, onLeave? }
        │   │                         #   ctx = { userId, roomId, tx }
        │   ├── dispatch.ts           # parse → rate-limit → validate → registry[action]
        │   ├── snapshot.ts           # { [featureName]: piece }, each piece versioned
        │   ├── rate-limit.ts         # per-socket token buckets, limits per action
        │   ├── rooms.ts              # Map<roomId, Set<socket>>
        │   └── broadcast.ts          # broadcastToRoom + readyState check
        ├── economy/                  # ★ the only code that moves points
        │   ├── ledger.ts             # double-entry: each tx = entries summing to 0;
        │   │                         #   debits are atomic:
        │   │                         #   UPDATE "User" SET balance = balance - $1
        │   │                         #   WHERE id = $2 AND balance >= $1 RETURNING balance
        │   │                         #   0 rows → insufficient balance, whole tx rolls back
        │   │                         #   forcedDebit(): no balance check, may go below 0
        │   │                         #   (used only for the double-down loss penalty)
        │   ├── accounts.ts           # USER:<id> · HOUSE · ESCROW:<ref> · SHOP
        │   └── daily-use.ts          # claim/restore DailyUse(userId, kind, day);
        │                             #   day = Postgres date of the Asia/Tokyo calendar
        ├── features/
        │   ├── chat/
        │   │   ├── index.ts          # Feature: chat:send, snapshot = recent chat
        │   │   ├── buffer.ts         # ring buffer, last 100 per room; stores userId,
        │   │   │                     #   not a decorated name; lost on restart (fine for MVP)
        │   │   └── commands/         # registry for "/…" messages
        │   │       ├── registry.ts
        │   │       └── help.ts       # (later) dice.ts
        │   ├── playback/
        │   │   ├── index.ts
        │   │   └── state.ts          # server-authoritative video state
        │   ├── profiles/
        │   │   ├── index.ts          # snapshot = profiles of users in the room
        │   │   └── display.ts        # builds DisplayProfile (name now, cosmetics later)
        │   ├── betting/
        │   │   ├── index.ts          # Feature: window:*, bet:place; snapshot =
        │   │   │                     #   activeWindow + myBet
        │   │   ├── windows.ts        # open (DB: one OPEN per room; ≥ 2 options,
        │   │   │                     #   unique labels, allowlisted colours);
        │   │   │                     #   extend only while OPEN, under the row lock
        │   │   ├── lock-window.ts    # SELECT … FROM "BettingWindow" WHERE id=$1 FOR UPDATE
        │   │   │                     #   (tx.$queryRaw inside prisma.$transaction)
        │   │   ├── transitions.ts    # under the row lock: UPDATE … WHERE id=? AND
        │   │   │                     #   status=<expected>; bumps window.version
        │   │   ├── timers.ts         # Map<windowId, Timeout> → auto-lock at closesAt
        │   │   ├── sweeper.ts        # every 10s: lock OPEN windows past closesAt
        │   │   ├── bets.ts           # one tx: lock window → OPEN and now() < closesAt
        │   │   │                     #   (DB clock) → option belongs to window →
        │   │   │                     #   ledger USER→ESCROW (atomic debit) →
        │   │   │                     #   DailyUse claim if doubled → insert bet
        │   │   │                     #   duplicate (userId, requestId) → look up the
        │   │   │                     #   original bet, reply bet:accepted {replayed: true}
        │   │   ├── odds.ts           # pool totals → estimated odds
        │   │   ├── payout.ts         # base  = floor(stake × pool / winningPool)
        │   │   │                     #   bonus = base if doubleDown else 0
        │   │   │                     #   base: ESCROW→winner · bonus: HOUSE→winner
        │   │   │                     #   doubled loser: penalty = stake, USER→HOUSE
        │   │   │                     #   via forcedDebit (balance may go below 0)
        │   │   │                     #   rounding remainder ESCROW→HOUSE
        │   │   ├── settle.ts         # settleWindow({ windowId, winnerOptionId,
        │   │   │                     #   resolver: ADMIN | RNG | EXTERNAL, resolutionRef })
        │   │   │                     #   rejects if resolver ≠ window.resolution;
        │   │   │                     #   winner must belong to the window;
        │   │   │                     #   LOCKED→SETTLED + all payouts in one tx
        │   │   └── void.ts           # →VOID, ESCROW→owners, restore DailyUse
        │   ├── wallet/
        │   │   ├── index.ts          # Feature: wallet:transfer, wallet:history
        │   │   └── transfer.ts       # USER→USER via ledger, checked debit (sender
        │   │                         #   can't go below 0), rate-limited, requestId
        │   │                         #   replay; large + new account → abuse flag
        │   ├── moderation/
        │   │   ├── index.ts          # Feature: mod:mute/kick/ban (admin role checked
        │   │   │                     #   on the server), report:create
        │   │   └── guards.ts         # muted users can't chat; banned users can't
        │   │                         #   get a ws ticket
        │   ├── shop/
        │   │   └── index.ts          # purchases: USER→SHOP
        │   ├── fantasy/
        │   ├── (later) rounds/       # extracted from betting when a 2nd timed-round
        │   │                         #   feature exists: lifecycle, timers, sweeper
        │   ├── (later) games/
        │   │   ├── rng.ts            # seed = crypto.randomBytes(32); publish SHA-256(seed);
        │   │   │                     #   result = map(HMAC-SHA256(seed, "<game>:<roundId>:<n>"));
        │   │   │                     #   reveal seed after settlement
        │   │   ├── dice/             # chat command + USER↔HOUSE payouts
        │   │   └── horse-race/       # a betting round with resolution = RNG
        │   └── (later) cosmetics/    # Item, Inventory, Equipped; allowlisted values
        ├── abuse/                    # detection: things that are flagged, never blocked
        │   ├── flags.ts              # raiseFlag(kind, userId, evidence)
        │   ├── signals/
        │   │   ├── shared-ip.ts      # sign-up/login from an IP another account used
        │   │   ├── vpn.ts            # (later) paid IP-reputation lookup
        │   │   ├── fingerprint.ts    # (later) FingerprintJS signal
        │   │   └── new-account-transfer.ts  # large transfers into/out of new accounts
        │   └── retention.ts          # deletes AuthEvent rows older than 90 days
        └── jobs/
            ├── sync-matches.ts       # OpenDota fetch
            └── score-fantasy.ts
```

## Adding a feature later

1. Add the message types under the new namespace in `shared/messages/` and their schemas in `shared/schemas/`.
2. Create `backend/src/features/<name>/index.ts` exporting a `Feature`.
3. Add it to `backend/src/features.ts`. This is the only change to shared code.
4. Move points only through `economy/ledger.ts`, using a new `LedgerReason` and refs of the form `<feature>:<id>`.
5. Build the frontend under `features/<name>/` and load it with `React.lazy`.
6. If it shows names, use `<Nickname>`. If it posts to chat, add a `ChatMessage` kind and a renderer for it.

## Database (PostgreSQL)

| Table | Key fields and constraints |
|---|---|
| `User` | email (normalized, unique), `emailVerifiedAt`, argon2id password hash, role, nickname, `balance` (cached, updated in the same tx as its ledger entries; can be negative after a double-down loss) |
| `Room` | name, host, `videoId`, `isPlaying`, `positionAt`, `updatedAt`, `playbackVersion` |
| `LedgerTx` | `id`, `reason`, `refId`, `createdAt`; unique `(reason, refId)`. The refId names exactly one movement, e.g. `window:123:user:42`, so a retried payout is rejected. |
| `LedgerEntry` | `txId`, `account` (`USER:<id>` / `HOUSE` / `ESCROW:<ref>` / `SHOP`), `amount` (+/−); the entries of a tx sum to 0 |
| `BettingWindow` | `roomId`, `question`, `status` (`OPEN` / `LOCKED` / `SETTLED` / `VOID`), `resolution` (`ADMIN` / `RNG` / `EXTERNAL`), `closesAt`, `minStake`, `maxStake`, `allowDoubleDown`, `winnerOptionId`, `version` (bumped on every transition, sent with every window message); one `OPEN` per room (raw SQL partial index) |
| `WindowOption` | `windowId`, `label`, `color`; unique `(windowId, id)`, unique `(windowId, label)` |
| `Bet` | `windowId`, `optionId`, `userId`, `stake`, `doubleDown`, `basePayout`, `bonusPayout`, `lossPenalty`, `requestId`; unique `(windowId, userId)`, unique `(userId, requestId)`; composite FK `(windowId, optionId) → WindowOption(windowId, id)` |
| `DailyUse` | `userId`, `kind` (`DOUBLE_DOWN`, later `FREE_SPIN`, `DAILY_BONUS`, …), `day` (Postgres `date`, Tokyo calendar), `refId`; unique `(userId, kind, day)` |
| `Match` | Dota match data synced from OpenDota |
| `ShopItem` / `Inventory` | point shop |
| `FantasyTeam` / `FantasyPick` | fantasy league (separate from betting windows) |
| `AuthEvent` | `userId`, `kind` (`SIGNUP` / `LOGIN` / `LOGIN_FAILED` / `RESET`), `ip` (IPv6 stored as /64), `userAgent`, `createdAt`; index on `ip`; deleted after 90 days |
| `EmailToken` | `userId`, `purpose` (`VERIFY` / `RESET` / `FIND_ID`), `tokenHash`, `expiresAt`, `usedAt` |
| `Flag` | `kind` (`SHARED_IP` / `VPN` / `FINGERPRINT` / `NEW_ACCOUNT_TRANSFER` / …), `userId`, `evidence` (JSON), `status` (`OPEN` / `DISMISSED` / `ACTIONED`), `reviewedBy` |
| `ModerationAction` | `userId`, `kind` (`MUTE` / `KICK` / `BAN`), `until`, `reason`, `byAdminId` |
| `Report` | `reporterId`, `targetUserId`, `messageRef`, `reason`, `status` |
| `RoomSettings` *(later)* | per-room toggles: games, chat commands, cosmetics |
| `Item` / `Equipped` *(later)* | `Item { type: BADGE / NAME_COLOR / FONT, data }` where `data` is an allowlisted id or colour, never raw CSS; `Equipped(userId, slot, itemId)`, unique `(userId, slot)` |
| `GameRound` *(later)* | dice/race rounds: `seedHash` published before, `seed` revealed after |

`Market` from the first draft is removed; `BettingWindow` replaces it. `DoubleDownUse` is replaced by `DailyUse`.

`winnerOptionId` is not a composite FK: pointing back into the same table pair makes Prisma's relation mapping awkward. Instead, `settle.ts` checks inside the locked transaction that the winner belongs to the window.

## Betting rules

| Rule | Decision |
|---|---|
| Bets per window | One per user, no edits after placing, one option only |
| Base return | `stake × odds`, where odds = total pool ÷ pool on the winning option (parimutuel). Shown as an estimate while open; final at lock. |
| Double down | Double-or-nothing. Win: `stake × odds × 2`. Lose: `stake × 2`. The stake is deducted when the bet is placed; the second stake is taken as a penalty at settlement. Only the stake counts in the pool, so other bettors' odds are unaffected. Once per user per Tokyo calendar day (`DailyUse` kind `DOUBLE_DOWN`). Restored if the window is voided. |
| Placing a double-down bet | Needs `balance ≥ stake`, the same as a normal bet. The user doesn't need to hold 2 × stake. |
| Win example | 5,000 on a 3.98x side, doubled: base 19,900 from the pool, plus a bonus of 19,900 from `HOUSE`, gives 39,800 returned (+34,800 profit). |
| Loss example | Balance 6,000, 5,000 doubled and lost: 5,000 is deducted when placing (balance 1,000), then a 5,000 penalty at settlement. Final balance: 6,000 − 10,000 = −4,000. |
| Negative balance | Shown as a negative number. Every normal debit still requires `balance ≥ amount`, so a user below 0 can't bet or buy until the balance is positive again. |
| Max stake | `maxStake` applies to the stake the user pays; double down doesn't change it |
| Money flow | Stake: `USER → ESCROW:window`. Settle: base `ESCROW → winners`, bonus `HOUSE → doubled winners`, penalty `doubled losers → HOUSE` (forced debit). Void: `ESCROW → owners`, no penalty. |
| Exact odds | Payouts use the exact `pool ÷ winningPool`, not the rounded odds on screen (3.98x). The bonus always equals the base, so a doubled payout is exactly 2 × base. |
| Rounding | Payouts rounded down to whole points; the remainder goes `ESCROW → HOUSE` so the ledger balances |
| No winning bets | Window is voided and everyone is refunded |
| Open windows | At most one `OPEN` per room, enforced in the database |
| Time | Server/DB clock decides; clients get `serverTime` + `closesAt` once and count down locally |
| Settlement | Conditional `LOCKED → SETTLED` update under the row lock; 0 rows changed means stop. Ledger uniqueness blocks double payouts. |
| Who settles | `ADMIN` windows: admin handler only. `RNG`: game engine only. `EXTERNAL`: match-sync job only. Anything else is rejected. |
| Concurrency | Every write to a window locks its row first (`FOR UPDATE`). Balance debits are conditional updates (`balance >= amount`). |
| Retries | A duplicate `(userId, requestId)` returns the original result with `replayed: true`, never `bet:rejected`. |
| Reconnect | The snapshot and live events both carry `version`; the client keeps the newest and never moves backward. |
| Collapse state | Client-only UI; the bet draft survives collapse/expand |

## Security and abuse policy

Points are free, can't be bought and can't be cashed out, so economy exploits only affect the leaderboard. They're flagged for the admin and tolerated. Anything that can harm the app, its infrastructure or real people is prevented.

| Risk | Response |
|---|---|
| Tor | **Blocked** at sign-up, login and ws ticket (free public exit list) |
| Bot mass sign-ups | **Prevented:** sign-up rate limit per IP and email verification. Add a CAPTCHA only if it actually happens. |
| Message floods / overload | **Prevented:** per-socket rate limits and message size caps |
| XSS through chat, nicknames or cosmetics | **Prevented:** user text is always rendered as text; cosmetics come from allowlists |
| Account takeover | **Prevented:** argon2id, login rate limits, single-use expiring email tokens |
| Harassment | **Prevented:** admin mute/kick/ban, report button |
| Admin actions | **Prevented:** role checked on the server for every admin action |
| Multiple accounts on one IP | **Flagged** (`SHARED_IP`). Friends on one Wi-Fi and mobile carrier-grade NAT make blocking unreliable. |
| VPN / private relay | **Flagged** later via a paid lookup; not blocked |
| Private browsing | Not detected. It can't be done reliably, and it's harmless (just no cookies). |
| Fingerprinting | Not now. Later, as one more flag signal, never a gate. |
| Alt accounts feeding a main one | **Flagged** (`NEW_ACCOUNT_TRANSFER`), tolerated |
| Negative balances | Tolerated. Bounded at −`maxStake` by the double-down rules; recovered through daily bonuses or transfers from friends. |

**IP data:** the IP and user agent are recorded at every sign-up and login and shown only to admins: each account's IP history, plus the accounts sharing an IP. Records are deleted after 90 days. A short privacy notice says what is stored and why, since IPs count as personal data under Japan's APPI.

**Points stay play money:** no buying points and no redeeming them for money or goods. The rules forbid real-money trading of points, which matters because transfers are allowed. If points ever become purchasable, get legal advice on Japanese gambling law first.

## Point transfers

| Rule | Decision |
|---|---|
| Allowed | Yes, user to user, through `wallet:transfer` |
| Money flow | `USER:sender → USER:receiver` as one ledger tx (reason `TRANSFER`) |
| Sender balance | Normal checked debit: the sender can't go below 0 |
| Receiver below 0 | Allowed. This is how friends bail each other out. |
| Limits | Rate-limited per user. Duplicate `requestId` replays the original result. |
| Visibility | Every transfer is visible in the admin transfers log |
| Flags | Large transfers into or out of new accounts raise `NEW_ACCOUNT_TRANSFER` |

## Future features: design notes

| Feature | Notes |
|---|---|
| Dice (chat command) | `/dice 100` goes through `chat/commands/`, then the dice feature. The server rolls with `crypto.randomInt`; payouts are `USER ↔ HOUSE`. Rate-limited per action. The result is posted as a `game` chat message. |
| Horse racing | A betting round with `resolution = RNG`. The server fixes the finishing order at start; the client animates toward it. Broadcast events (start, result), never frames. Extract `rounds/` from `betting/` at this point. |
| Provably fair | Commit–reveal: generate a secret seed, publish `SHA-256(seed)` before accepting bets, and derive the result deterministically with `HMAC-SHA256(seed, "<game>:<roundId>:<n>")`. Reveal the seed after settlement so anyone can recompute both the hash and the result. `crypto.randomInt` alone can't be verified this way. |
| Cosmetics | Purchases are `USER → SHOP`. Equipping emits `user:profile_updated`, and `<Nickname>` picks it up everywhere. Name colours are checked for contrast; fonts come from an allowlist. |
| Right rail | `BetRail` becomes `ActivityRail`: one live activity (a bet window, a race, a dice lobby) in the collapsed/expanded pattern, with chat in the remaining space. |
| Economy health | With a double-entry ledger, `HOUSE` and `SHOP` balances show whether games inflate or deflate points. Double-down bonuses flow out of `HOUSE` and penalties flow back in; shop purchases are a sink. Watch long-shot odds: 5,000 doubled at 40x pays a 200,000 bonus. Add a bonus cap later if that becomes a problem. Negative balances make abandoned accounts an exploit (go negative, make a new account), which ties into the duplicate-account flagging in `abuse.ts`. |
| Multi-server (much later) | Room maps move to Redis pub/sub. Timers move to the DB sweeper using `SELECT … FOR UPDATE SKIP LOCKED`. Nothing in this design blocks either move. |

## Build order

1. The core: `shared` messages, `ws/` (upgrade, dispatch, the feature registry, snapshot) and the chat feature, using a temporary dev identity. This is mostly a TypeScript port of `socket-learning`, reshaped as the first registered feature.
2. Real auth: email sign-up and verification, login, password reset and find ID, argon2id, `AuthEvent` recording, the Tor block, the ws ticket, and the profiles feature with `<Nickname>`.
3. `room:snapshot` and reconnect handling.
4. Playback sync.
5. The economy: double-entry ledger, accounts, atomic debits, cached balance and `DailyUse`.
6. Betting windows: open, lock (with the row lock), place a bet (with replay), settle (with the resolution check), void, and double down.
7. Wallet transfers, moderation (mute/kick/ban/report) and the admin flags queue.
8. The shop.
9. Fantasy.
10. *(Later)* Chat commands and dice, then horse racing (extract `rounds/` here), then cosmetics.
