# Watch party

A watch-party app: synced YouTube/Twitch playback, live chat and play-point betting windows. It started as a project to learn the raw WebSocket technology underneath Socket.IO, and the real-time layer is still built by hand on `ws`.

## Status

The design and plan are written; the code is being rebuilt from scratch. Next up is **step 0 (dev setup)**: follow [`docs/guide/step-0-guide.md`](docs/guide/step-0-guide.md).

The original JavaScript learning servers (raw `ws` and Socket.IO versions) and the `client/test.html` test page were removed. You can still read them in git history: `git show 42ab038:server/index.js`.

## Stack

| Part | Tech |
|---|---|
| `client/` | Next.js 16 (App Router, TypeScript), CSS Modules + CSS variables, Zustand. Frontend only, on http://localhost:3000 |
| `server/` | Node 22 + TypeScript, built-in `http` + `ws`, Prisma 6, zod. The only backend (auth, database, WebSockets), on http://localhost:4000 |
| `shared/` | `@watchparty/shared`: message schemas, limits and error codes both sides import |
| Database | PostgreSQL 16 (Docker) |
| Email (dev) | Mailpit (Docker), inbox at http://localhost:8025 |
| Tests | Vitest, against a real Postgres test database |

How it fits together: the browser loads pages from Next.js, which renders them using data fetched from the server and forwards `/auth/*`, `/api/*` and `/health` to it. The WebSocket connects straight to the server.

In production everything runs in Docker (`docker-compose.prod.yml`). Caddy sits in front on one domain: `/auth/*`, `/api/*`, `/ws` and `/health` go to the server container, and everything else goes to the Next.js container. Daily development and tests run on your machine, with only Postgres and Mailpit in Docker.

## Docs

- [`docs/watchparty_app_project-structure.md`](docs/watchparty_app_project-structure.md): the design and source of truth (rules, economy, schema, protocol, file tree). Where it disagrees with the mockups, the doc wins.
- [`docs/watchparty_phases.md`](docs/watchparty_phases.md): phases, scope and exit criteria for each step.
- [`docs/watchparty_execution_plan.md`](docs/watchparty_execution_plan.md): the task-by-task checklist.
- [`docs/guide/`](docs/guide/): hands-on guides per step.
- [`docs/watchpartySS/`](docs/watchpartySS/): UI mockups (PNG, HTML, PDF).

## Running (once step 0 is done)

Prerequisites: Node 22, npm 10, Docker Desktop.

```bash
npm install
cp server/.env.example server/.env          # first time only
cp client/.env.example client/.env.local    # first time only
npm run db:up                               # Postgres + Mailpit
npm run dev                                 # open http://localhost:3000
```

Checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Production (Docker)

```bash
cp deploy/production.env.example deploy/production.env   # first time; set your domain, passwords, SMTP
npm run prod:up                                          # build images and start Caddy, client, server, Postgres
npm run prod:logs                                        # follow the logs
npm run prod:down                                        # stop (the database volume is kept)
```

With the example values (`SITE_ADDRESS=http://localhost`) this is a local rehearsal on http://localhost. With a real domain, Caddy gets an HTTPS certificate automatically. Details: "Deployment (Docker)" in the structure document.
