# Step 0 guide: dev setup

A hands-on walkthrough of step 0 from [`watchparty_execution_plan.md`](../watchparty_execution_plan.md). Follow the parts in order; each one ends with a checkpoint. When every checkpoint passes, step 0 is done.

**What you'll have at the end:** one repository with three packages (`shared`, `server`, `client`) that install, lint, typecheck, test, build and run with one command each, plus Postgres and Mailpit running in Docker. The frontend is a Next.js app on `:3000`; the backend (API and, from step 1, WebSockets) is a Node server on `:4000`. You'll also have the production stack: the whole app (Caddy, client, server, Postgres) running in Docker with one command. Daily development and tests stay on your machine.

**Time:** about 1–2 hours.

**Shell:** the commands are written for Git Bash. Run every command from the repository root (`d:/Projects/socket-learning`) unless the step says otherwise.

## Before you start

- [ ] Node 22 (`node -v` → `v22.x`) and npm 10 (`npm -v`).
- [ ] Docker Desktop is running (`docker ps` works without an error).
- [ ] Nothing is using ports 3000, 4000, 5432, 1025, 8025, 8026, 80 or 443. Check with `netstat -ano | grep -E ":(3000|4000|5432|1025|8025|8026|80|443) "`; no output means they're free. A locally installed PostgreSQL service often holds 5432; stop it in Services, or see Troubleshooting.
- [ ] Internet access the first time you run the client (`next/font` downloads the fonts once and then serves them itself).
- [ ] Create a branch: `git checkout -b step-0-dev-setup`.

## How the pieces fit

```
socket-learning/
├── package.json         ← root: lists the three workspaces, holds shared dev tools (TypeScript, ESLint, Prettier)
├── shared/              ← @watchparty/shared: code both sides import, used as TypeScript source (no build step)
├── server/              ← Node + TypeScript on :4000 — the only backend (database, auth, WebSockets)
├── client/              ← Next.js on :3000 — frontend only (pages; no database, no business rules)
├── docker-compose.yml   ← dev: Postgres 16 (dev + test databases) and Mailpit (catches emails)
├── docker-compose.prod.yml ← production: Caddy + client + server + Postgres, all in Docker
└── deploy/              ← Caddyfile and the production env file
```

How a request travels in development:

```
Browser ──▶ :3000 Next.js ──(page HTML)
   │            │ server components fetch http://localhost:4000/... directly
   │            │ /auth/*, /api/*, /health are rewritten to :4000
   │            ▼
   │        :4000 server
   └── WebSocket (from step 1) goes straight to ws://localhost:4000/ws
```

npm **workspaces** mean there's one `node_modules/` and one `package-lock.json` at the root. `npm install` at the root installs all three packages, and `@watchparty/shared` is linked into `node_modules/` so `server` and `client` can `import ... from '@watchparty/shared'`.

---

## Part 1: clean up the old server

The old Express/Socket.IO dependencies are replaced. The old code itself was already deleted (you can still read it with `git show 42ab038:server/index.js`).

```bash
rm -rf server/node_modules server/package-lock.json server/package.json
```

Leave `server/.env` and `server/.env.example` for now; you'll overwrite them in Part 5.

**Checkpoint:** `ls -a server` shows only `.env` and `.env.example`.

---

## Part 2: root files

Create each file below at the repository root.

### `package.json`

```json
{
  "name": "watchparty",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,magenta \"npm run dev -w server\" \"npm run dev -w client\"",
    "build": "npm run build -w server && npm run build -w client",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint . && npm run lint -w client",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:migrate": "npm run db:migrate -w server",
    "db:reset": "npm run db:reset -w server",
    "db:seed": "npm run db:seed -w server",
    "prod:up": "docker compose -f docker-compose.prod.yml --env-file deploy/production.env up -d --build",
    "prod:down": "docker compose -f docker-compose.prod.yml --env-file deploy/production.env down",
    "prod:logs": "docker compose -f docker-compose.prod.yml --env-file deploy/production.env logs -f"
  }
}
```

Why: `-w server` runs a script inside that workspace; `--workspaces --if-present` runs it in every workspace that defines it. `lint` runs the root ESLint config (server and shared), then the client's own Next.js config.

### `tsconfig.base.json`

Used by `shared` and `server`. The client keeps the `tsconfig.json` that Next.js generates.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

Why: `moduleResolution: "Bundler"` lets you write `import { x } from './file'` without a `.js` suffix; `tsx`, `tsup`, Next.js and Vitest all understand it. `noEmit` because TypeScript only type-checks here; other tools produce the JavaScript.

### `.gitattributes`

```
* text=auto eol=lf
*.png binary
*.pdf binary
*.ico binary
```

Why: keeps line endings as LF on Windows so Prettier and Git don't fight over every file.

### `.prettierrc`

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

### `.prettierignore`

```
node_modules
dist
.next
coverage
next-env.d.ts
package-lock.json
server/prisma/migrations
docs/**/*.html
*.png
*.pdf
*.ico
```

### `.gitignore`

Replace the existing file with:

```
node_modules/

# env files
.env
.env.*
!.env.example

# logs
npm-debug.log*
*.log

# build and test output
dist/
build/
.next/
coverage/
*.tsbuildinfo
next-env.d.ts

# production secrets (Part 11)
deploy/production.env

# OS/editor
.DS_Store
```

**Checkpoint:** `cat package.json` shows the workspaces. Don't run `npm install` yet; the workspace folders need their own `package.json` first.

---

## Part 3: Docker (Postgres + Mailpit)

### `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: watchparty
      POSTGRES_PASSWORD: watchparty
      POSTGRES_DB: watchparty
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U watchparty']
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit
    ports:
      - '1025:1025'
      - '8025:8025'

volumes:
  pgdata:
```

### `docker/postgres/init.sql`

```bash
mkdir -p docker/postgres
```

```sql
CREATE DATABASE watchparty_test OWNER watchparty;
```

Why: Postgres runs scripts in `/docker-entrypoint-initdb.d/` only the **first** time the data volume is created. This one adds the separate test database that `npm test` uses, so tests never touch your dev data.

### Start it

```bash
docker compose up -d
docker compose ps
```

**Checkpoint**
- `docker compose ps` shows `postgres` as `healthy` (give it ~10 seconds) and `mailpit` as running.
- `docker compose exec postgres psql -U watchparty -l` lists both `watchparty` and `watchparty_test`.
- `http://localhost:8025` opens the Mailpit inbox.

---

## Part 4: the shared package

```bash
mkdir -p shared/src
```

### `shared/package.json`

```json
{
  "name": "@watchparty/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Why: `exports` points straight at the TypeScript source. Next.js (with `transpilePackages`), `tsx`, `tsup` and Vitest all compile TypeScript themselves, so `shared` never needs its own build.

### `shared/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src"]
}
```

### `shared/src/index.ts`

```ts
export const APP_NAME = 'WATCHPARTY';

export { LIMITS } from './limits';
export { ERROR_CODES, type ErrorCode } from './errors';
```

### `shared/src/limits.ts`

```ts
// Filled in from step 1 onwards (see "Protocol limits" in the structure document).
export const LIMITS = {} as const;
```

### `shared/src/errors.ts`

```ts
// Filled in from step 1 onwards.
export const ERROR_CODES = [] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
```

### `shared/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { APP_NAME, LIMITS } from './index';

describe('@watchparty/shared', () => {
  it('exports the app name and limits', () => {
    expect(APP_NAME).toBe('WATCHPARTY');
    expect(LIMITS).toBeDefined();
  });
});
```

(`APP_NAME` is only there so Part 10's checks can prove both the server and the client import from `shared`.)

---

## Part 5: the server package

```bash
mkdir -p server/src/http server/prisma server/test
```

### `server/package.json`

```json
{
  "name": "server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsup src/index.ts --format esm --target node22 --clean --noExternal @watchparty/shared",
    "start": "node --env-file=.env dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "tsx --env-file=.env prisma/seed.ts"
  }
}
```

Why: `tsx watch` restarts the server when you save a file. `--env-file` is built into Node 22, so no `dotenv` package is needed. `--noExternal @watchparty/shared` tells `tsup` to bundle the shared source into the output, because it isn't a built package. `db:seed` points at a file that arrives in step 2; that's expected.

### `server/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "prisma", "vitest.config.ts"]
}
```

### `server/.env.example`

Overwrite the old file with exactly this:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty
TEST_DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty_test
ALLOWED_ORIGINS=http://localhost:3000
SESSION_TTL_DAYS=30
TRUSTED_PROXIES=127.0.0.1,::1
SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM=watchparty@localhost
TWITCH_PARENT_DOMAINS=localhost
ADMIN_LOGIN_ID=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

Then make your local copy:

```bash
cp server/.env.example server/.env
```

- `PORT=4000`: Next.js takes 3000.
- `ALLOWED_ORIGINS=http://localhost:3000`: the browser's pages come from Next.js, so that's the `Origin` the server will see on POSTs and on the WebSocket.
- `TRUSTED_PROXIES`: from step 2, the server only believes an `X-Forwarded-For` header (the user's real IP) when it comes from these addresses — the Next.js server and, in production, the reverse proxy, both on the same machine.
- The admin values can stay empty until step 2. `.env` is git-ignored; `.env.example` is committed.

### `server/src/config.ts`

```ts
import { z } from 'zod';

const list = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  TEST_DATABASE_URL: z.url().optional(),
  ALLOWED_ORIGINS: list,
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TRUSTED_PROXIES: list,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  MAIL_FROM: z.string().min(1),
  TWITCH_PARENT_DOMAINS: list,
  ADMIN_LOGIN_ID: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid server/.env:\n${problems}`);
    process.exit(1);
  }
  return result.data;
}
```

Why: the server refuses to start with a clear list of what's wrong, instead of crashing later on an `undefined`. Everything else reads settings from the returned object, never from `process.env` directly.

### `server/src/http/router.ts`

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
}
```

### `server/src/app.ts`

```ts
import http from 'node:http';
import { route } from './http/router';

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}
```

Why a separate `app.ts`: tests import `createServer()` and listen on a random port, without reading `.env` or taking port 4000. The WebSocket upgrade handler is attached here in step 1.

### `server/src/index.ts`

```ts
import { APP_NAME } from '@watchparty/shared';
import { createServer } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const server = createServer();

server.listen(config.PORT, () => {
  console.log(`${APP_NAME} server listening on http://localhost:${config.PORT}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, closing server`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

### `server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Write this by hand instead of running `prisma init`: `init` can add an output folder and a config file that the later steps don't expect. There are no models yet, so there's no Prisma client code in step 0; `src/db.ts` and the first models arrive in step 2.

### `server/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
```

Why: `fileParallelism: false` runs test files one at a time. It matters from step 2, when tests share the test database.

### `server/test/setup.ts`

```ts
// Loads server/.env so tests can read TEST_DATABASE_URL. Test files never use DATABASE_URL.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env (for example in CI): rely on the real environment.
}
```

### `server/test/health.test.ts`

```ts
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/app';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});
```

### `server/test/db.test.ts`

```ts
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('test database', () => {
  it('is reachable', () => {
    const url = process.env.TEST_DATABASE_URL;
    expect(url, 'TEST_DATABASE_URL must be set in server/.env').toBeTruthy();

    execSync(`npx prisma db execute --url "${url}" --stdin`, {
      input: 'SELECT 1;',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });
});
```

Why this way: without any models there's no Prisma client to query with, but `prisma db execute` can still run raw SQL against a URL. If Postgres is down or the test database is missing, this test fails with Prisma's error message. From step 2 this is replaced by real database tests.

---

## Part 6: the client package (Next.js)

### Scaffold

```bash
npx create-next-app@16 client --ts --app --src-dir --eslint --no-tailwind --no-react-compiler \
  --import-alias "@/*" --use-npm --skip-install --disable-git
```

What the flags mean: TypeScript, App Router, code under `client/src/`, ESLint, no Tailwind, no React Compiler, `@/` as the import alias for `client/src/`, npm, **don't install yet** (Part 7 installs everything at once from the root), and don't create a nested git repository.

If it stops with `unknown option` for one of the flags (flag names change between versions), remove that flag and answer the question it asks instead, using the choices above. If it asks "Would you like to use the recommended Next.js defaults?", choose to customize, because the defaults include Tailwind.

### Remove what you don't need

```bash
rm -f client/package-lock.json client/README.md client/src/app/page.module.css client/src/app/globals.css
rm -rf client/node_modules client/public/*.svg
touch client/public/.gitkeep
```

(The `.gitkeep` keeps the now-empty `public/` folder in git; the client Dockerfile in Part 11 copies it.)

(`client/node_modules` and `client/package-lock.json` only exist if the installer ran anyway; a second lockfile confuses npm workspaces and Next.js.)

Open `client/.gitignore` (generated) and add this line below the `.env*` line, so the example file is committed:

```
!.env.example
```

### `client/package.json`

Keep the generated `dependencies` and `devDependencies` as they are, and set the name and scripts:

```json
{
  "name": "client",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit"
  }
}
```

(Merge this with the generated file; don't delete the dependency blocks.)

Why `next typegen`: Next.js generates types for routes and page props; `typegen` writes them without a full build so `tsc` can check everything. If your Next.js version doesn't have `typegen`, use `"typecheck": "tsc --noEmit"`.

### `client/.env.example`

```
INTERNAL_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
```

Then:

```bash
cp client/.env.example client/.env.local
```

- `INTERNAL_API_URL` is read only by the Next.js server: for the rewrites and for server components fetching data.
- `NEXT_PUBLIC_WS_URL` is built into the browser code (anything starting with `NEXT_PUBLIC_` is). It's used from step 1; in production it stays empty and the client uses `wss://<same host>/ws`.

### `client/next.config.ts`

Replace the file with:

```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
const repoRoot = path.join(__dirname, '..');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  transpilePackages: ['@watchparty/shared'],
  async rewrites() {
    return [
      { source: '/auth/:path*', destination: `${apiUrl}/auth/:path*` },
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/health', destination: `${apiUrl}/health` },
    ];
  },
};

export default nextConfig;
```

Why: `transpilePackages` makes Next.js compile `@watchparty/shared` from its TypeScript source. The rewrites forward those paths to the server, so the browser only ever talks to `:3000` (cookies in step 2 stay same-origin). The client never defines its own `app/api` routes; `/api/*` always belongs to the server. `output: 'standalone'` makes `next build` produce a self-contained server (`server.js` plus only the `node_modules` it needs) for the Docker image in Part 11. The two `repoRoot` settings tell Next.js the repository root is one folder up, because `shared/` and the single `node_modules/` live there.

### `client/eslint.config.mjs`

Replace the generated file with the same config plus Prettier's "turn off formatting rules" config at the end:

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
```

If your generated file looks different (older template), keep its contents and just add `prettier` as the last entry.

### Styles

```bash
mkdir -p client/src/styles client/src/lib/server
```

#### `client/src/styles/tokens.css`

```css
:root {
  --ground: #0d1015;
  --surface: #151a21;
  --raised: #1c232c;
  --line: #2a333f;
  --text: #e9edf2;
  --muted: #97a3b3;
  --gold: #f4b942;
  --side-a: #5b9bff;
  --side-b: #ff9a55;
  --win: #3dbe8b;
  --live: #d93a40;

  --radius: 10px;
}
```

These come straight from the theme sample mockup. The font variables (`--font-display`, `--font-body`, `--font-num`) are set by `next/font` in the layout.

#### `client/src/styles/global.css`

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
}

body {
  background: var(--ground);
  color: var(--text);
  font-family: var(--font-body), system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
h3 {
  font-family: var(--font-display), system-ui, sans-serif;
  font-weight: 600;
  margin: 0;
}

button,
input {
  font: inherit;
}
```

### `client/src/app/layout.tsx`

Replace the file with:

```tsx
import type { Metadata } from 'next';
import { Barlow_Condensed, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/global.css';

const display = Barlow_Condensed({ subsets: ['latin'], weight: '600', variable: '--font-display' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-body' });
const num = JetBrains_Mono({ subsets: ['latin'], weight: '600', variable: '--font-num' });

export const metadata: Metadata = {
  title: 'Watch party',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Why: `next/font/google` downloads the fonts at dev/build time and serves them from your own site, so users never request Google Fonts. Each font sets a CSS variable that the stylesheets use.

### `client/src/lib/server/api.ts`

```ts
import 'server-only';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Why: this is the one place server components call the backend. `import 'server-only'` makes the build fail if a client component ever imports it. `cache: 'no-store'` because this data is per-user and live; Next.js must never cache it. In step 2 this function starts forwarding the user's cookie.

### `client/src/app/ClientHealth.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './page.module.css';

export function ClientHealth() {
  const [status, setStatus] = useState<string>('checking…');

  useEffect(() => {
    fetch('/health')
      .then(async (res) => {
        const body = (await res.json()) as { ok?: boolean };
        setStatus(body.ok ? 'ok' : `HTTP ${res.status}`);
      })
      .catch((error: unknown) => setStatus(String(error)));
  }, []);

  return (
    <p className={styles.status}>
      From the browser (through the rewrite):{' '}
      <span className={status === 'ok' ? styles.ok : styles.error}>{status}</span>
    </p>
  );
}
```

### `client/src/app/page.tsx`

Replace the file with:

```tsx
import { APP_NAME } from '@watchparty/shared';
import { apiGet } from '@/lib/server/api';
import { ClientHealth } from './ClientHealth';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await apiGet<{ ok: boolean }>('/health');

  return (
    <main className={styles.page}>
      <h1 className={styles.logo}>
        WATCH<span>PARTY</span>
      </h1>
      <p className={styles.muted}>Shared package says: {APP_NAME}</p>
      <p className={styles.status}>
        Rendered on the server:{' '}
        {health.ok && health.data.ok ? (
          <span className={styles.ok}>ok</span>
        ) : (
          <span className={styles.error}>{health.ok ? 'unexpected reply' : health.error}</span>
        )}
      </p>
      <ClientHealth />
    </main>
  );
}
```

Why two checks: they prove the two ways the frontend reaches the backend. The first line is fetched by the Next.js server while it renders the page (the pattern used for the room list and the header later). The second is fetched by the browser through the rewrite (the pattern used for sign-up and login). `force-dynamic` stops `next build` from trying to pre-render this page while the server isn't running.

### `client/src/app/page.module.css`

```css
.page {
  display: grid;
  place-content: center;
  gap: 12px;
  min-height: 100vh;
  text-align: center;
}

.logo {
  font-size: 56px;
  letter-spacing: 0.02em;
}

.logo span {
  color: var(--gold);
}

.muted {
  color: var(--muted);
  margin: 0;
}

.status {
  font-family: var(--font-num), ui-monospace, monospace;
  margin: 0;
}

.ok {
  color: var(--win);
}

.error {
  color: var(--live);
}
```

---

## Part 7: install everything

Now every workspace has a `package.json`, so install from the root. Run these one by one.

```bash
# Root: shared dev tools (server + shared linting, formatting)
npm install -D typescript@5 concurrently prettier eslint@9 @eslint/js typescript-eslint \
  globals eslint-config-prettier

# Shared
npm install -w shared zod@4
npm install -w shared -D vitest

# Server
npm install -w server ws zod@4 @prisma/client@6
npm install -w server -D prisma@6 tsx tsup vitest @types/node@22 @types/ws

# Client (also installs what create-next-app listed: next, react, eslint-config-next, …)
npm install -w client zustand server-only
```

Now link the shared package by hand. `npm install @watchparty/shared` would look for it on the public registry, so instead add this line to the `"dependencies"` block of **both** `server/package.json` and `client/package.json`:

```json
"@watchparty/shared": "*"
```

Then run a plain install from the root so npm links it:

```bash
npm install
```

Why the pinned majors: Prisma 6 because Prisma 7 changes how the client is generated; zod 4 because `config.ts` uses zod 4's `z.url()`; ESLint 9 and TypeScript 5 to match what Next.js 16 is built for; `@types/node@22` to match your Node version.

**Checkpoint**
- There's a single `package-lock.json` at the root and none inside `server/`, `client/` or `shared/`.
- `ls node_modules/@watchparty` shows `shared` (a link to your `shared/` folder).
- `grep -E "express|socket.io|nodemon" server/package.json` prints nothing.

---

## Part 8: ESLint for server and shared

### `eslint.config.js` (repository root)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['client/**', '**/dist', '**/coverage', '**/node_modules', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
```

Why the root ignores `client/`: the client has its own Next.js ESLint config (Part 6), which registers its own React and TypeScript plugins. Putting both in one file makes ESLint complain about plugins being defined twice. `npm run lint` runs both.

---

## Part 9: README

`README.md` already describes the new stack, the docs and the run commands. Once Parts 10 and 11 pass, make two small edits:

- In **Status**, replace the "Next up is step 0" sentence with "Step 0 (dev setup) is done; next up is step 1 (WebSocket core and chat)."
- Rename the heading **Running (once step 0 is done)** to **Running**.

---

## Part 10: verify step 0

Run each check. All of them should pass.

```bash
npm run format        # formats everything once; review the diff if it's large
npm run lint
npm run typecheck
npm test
```

Expected:
- `lint`: no errors from either config (warnings are fine).
- `typecheck`: no errors from `shared`, `server` or `client`.
- `test`: `shared` 1 passed; `server` 3 passed (health ×2, database ×1). The client has no tests yet.

Then run the app:

```bash
npm run dev
```

- The terminal shows `WATCHPARTY server listening on http://localhost:4000` (blue) and Next.js ready on `http://localhost:3000` (magenta).
- `http://localhost:4000/health` and `http://localhost:3000/health` both show `{"ok":true}` (the second one through the rewrite).
- `http://localhost:3000` shows the gold-and-white **WATCHPARTY** logo in Barlow Condensed on the dark background, "Shared package says: WATCHPARTY", and both "Rendered on the server: ok" and "From the browser (through the rewrite): ok" in green.
- View the page source (Ctrl+U): "Rendered on the server: ok" is already in the HTML; the browser line says "checking…" there, because it's filled in after the page loads.
- Stop only the server (Ctrl+C stops both; instead run `npm run dev -w client` alone): refresh the page and both lines show an error in red. Start everything again with `npm run dev` and both return to "ok".
- Break the config on purpose: set `PORT=abc` in `server/.env`, run `npm run dev -w server`, and confirm it exits with `Invalid server/.env: PORT: ...`. Put it back.

Finally, the production build:

```bash
npm run build
```

- `server/dist/index.js` exists (one file, with `shared` bundled in).
- `client/.next/` exists and the Next.js build output lists `/` as a dynamic route (`ƒ`).
- `client/.next/standalone/client/server.js` exists (the standalone output used by the Docker image).

---

## Part 11: production stack in Docker

In production everything runs in Docker on one machine. Caddy is the only container with published ports. It sends `/auth/*`, `/api/*`, `/ws` and `/health` to the server and everything else to Next.js, and it handles HTTPS automatically once you give it a real domain. Here you'll build it and run a **local rehearsal** on `http://localhost`.

```
Browser ──▶ caddy :80/:443 ──┬─ /auth/* /api/* /ws /health ─▶ server:4000 ──▶ postgres
                             └─ everything else ────────────▶ client:3000 ──▶ server:4000
```

Inside Docker, containers reach each other by service name (`server`, `postgres`), not `localhost`.

### `.dockerignore` (repository root)

```
**/node_modules
**/.next
**/dist
**/coverage
**/.env
**/.env.*
!**/.env.example
**/*.log
.git
docs
deploy/production.env
```

Why: both images are built with the repository root as the build context (Part 2's single lockfile lives there). This keeps the context small and, more importantly, keeps your `.env` files out of the images. A copied `client/.env.local` would be built into the browser code and point it at `ws://localhost:4000`.

### `server/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server

COPY tsconfig.base.json ./
COPY shared shared
COPY server server

WORKDIR /app/server
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

Why each part:
- **Package files before source:** Docker caches each step, so `npm ci` only reruns when a `package.json` or the lockfile changes, not on every code edit. All three workspace `package.json` files are copied because `npm ci` checks them against the lockfile, even though only the server's dependencies get installed.
- **`openssl`:** Prisma needs it and the slim image doesn't include it.
- **`prisma migrate deploy`:** applies any new migrations every time the container starts. In step 0 there are none, so it just says so.
- **Plain `node`:** the start script's `--env-file` isn't used here; settings come from the compose file.
- **`USER node`:** the app doesn't run as root.
- **Image size:** the image keeps the dev dependencies, because the Prisma CLI (for migrations) and `tsx` (for the admin seed in step 2) are dev dependencies. That's fine for an app this size.

### `client/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w client

COPY tsconfig.base.json ./
COPY shared shared
COPY client client

ENV INTERNAL_API_URL=http://server:4000
RUN npm run build -w client

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/client/.next/standalone ./
COPY --from=build --chown=node:node /app/client/.next/static ./client/.next/static
COPY --from=build --chown=node:node /app/client/public ./client/public

USER node
EXPOSE 3000
CMD ["node", "client/server.js"]
```

Why:
- **Two stages:** the first builds; the second only copies the standalone output, so the final image has no build tools and no full `node_modules`. The standalone folder mirrors the repository layout (because of `outputFileTracingRoot`), which is why the entry point is `client/server.js`. Next.js doesn't put `static` and `public` into the standalone folder, so they're copied separately.
- **`INTERNAL_API_URL` at build time:** Next.js writes the rewrites into the build output, so their target is fixed when the image is built.
- **`NEXT_PUBLIC_WS_URL`:** deliberately not set, so the browser uses `wss://<same host>/ws` from step 1.
- **`HOSTNAME=0.0.0.0`:** makes Next.js listen on all of the container's addresses, so Caddy can reach it.

### `deploy/Caddyfile`

```bash
mkdir -p deploy
```

```
{$SITE_ADDRESS} {
	encode zstd gzip

	@backend path /auth/* /api/* /ws /health
	handle @backend {
		reverse_proxy server:4000
	}

	handle {
		reverse_proxy client:3000
	}
}
```

Why: `{$SITE_ADDRESS}` comes from `production.env`. A real domain (`watch.example.com`) makes Caddy fetch an HTTPS certificate automatically; `http://localhost` serves plain HTTP for the rehearsal. `handle` blocks are tried in order and the first match wins, so the backend paths never reach Next.js. Caddy passes WebSocket upgrades through and adds `X-Forwarded-For` on its own.

### `deploy/production.env.example`

```
# Copy to deploy/production.env (git-ignored) and fill in.
# The values below are for a local rehearsal on http://localhost.

# Where Caddy listens: a domain (automatic HTTPS) or http://localhost
SITE_ADDRESS=http://localhost
# The origin browsers use; https://<domain> on the real server
PUBLIC_ORIGIN=http://localhost

POSTGRES_USER=watchparty
POSTGRES_PASSWORD=change-me
POSTGRES_DB=watchparty

SMTP_HOST=mailpit
SMTP_PORT=1025
MAIL_FROM=watchparty@localhost

TWITCH_PARENT_DOMAINS=localhost

ADMIN_LOGIN_ID=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# Starts the bundled Mailpit (UI on http://localhost:8026). Remove on the real server.
COMPOSE_PROFILES=local
```

```bash
cp deploy/production.env.example deploy/production.env
```

On the real server, use a long random `POSTGRES_PASSWORD` with only letters and digits (it goes into a URL, where symbols like `@` or `/` would break it), your SMTP provider's host and port, and your domain in `SITE_ADDRESS`, `PUBLIC_ORIGIN` and `TWITCH_PARENT_DOMAINS`.

### `docker-compose.prod.yml` (repository root)

```yaml
name: watchparty-prod

services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?set in deploy/production.env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in deploy/production.env}
      POSTGRES_DB: ${POSTGRES_DB:?set in deploy/production.env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [internal]

  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      ALLOWED_ORIGINS: ${PUBLIC_ORIGIN:?set in deploy/production.env}
      SESSION_TTL_DAYS: 30
      TRUSTED_PROXIES: 172.28.0.0/24
      SMTP_HOST: ${SMTP_HOST:?set in deploy/production.env}
      SMTP_PORT: ${SMTP_PORT:?set in deploy/production.env}
      MAIL_FROM: ${MAIL_FROM:?set in deploy/production.env}
      TWITCH_PARENT_DOMAINS: ${TWITCH_PARENT_DOMAINS:?set in deploy/production.env}
      ADMIN_LOGIN_ID: ${ADMIN_LOGIN_ID:-}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
    networks: [internal]

  client:
    build:
      context: .
      dockerfile: client/Dockerfile
    restart: unless-stopped
    environment:
      INTERNAL_API_URL: http://server:4000
    depends_on:
      server:
        condition: service_healthy
    networks: [internal]

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    environment:
      SITE_ADDRESS: ${SITE_ADDRESS:?set in deploy/production.env}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - client
      - server
    networks: [internal]

  mailpit:
    image: axllent/mailpit
    profiles: [local]
    ports:
      - '127.0.0.1:8026:8025'
    networks: [internal]

networks:
  internal:
    ipam:
      config:
        - subnet: 172.28.0.0/24

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

Why:
- **Only Caddy publishes ports.** Postgres, the server and Next.js are reachable only inside the `internal` network. Mailpit's UI is published on `127.0.0.1:8026`, so it doesn't clash with the dev Mailpit on 8025 and isn't reachable from other machines.
- **`${VAR:?…}`:** compose refuses to start and names the missing variable instead of starting with an empty value. `$$` in the health check is an escaped `$`, so the variable is read inside the container.
- **Start order:** Postgres healthy → server (migrations, then `/health` healthy) → client → Caddy.
- **Fixed subnet:** the containers' addresses fall in `172.28.0.0/24`. From step 2, `TRUSTED_PROXIES` uses that range to decide whose `X-Forwarded-For` header (the user's real IP) to believe: Caddy's and the Next.js server's.
- **`name: watchparty-prod`:** keeps these containers and volumes separate from the dev `docker-compose.yml`, so both can run at the same time.

### Run the rehearsal

```bash
npm run prod:up
```

The first build takes a few minutes (dependencies, `next build`, font downloads). Then:

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/production.env ps
```

**Checkpoint**
- All five containers are running; `postgres` and `server` show `healthy`.
- In the `PORTS` column only `caddy` (80, 443) and `mailpit` (`127.0.0.1:8026`) list anything.
- `http://localhost/health` shows `{"ok":true}` (Caddy → server).
- `http://localhost` shows the placeholder with both "Rendered on the server: ok" (client container → `server:4000`) and "From the browser (through the rewrite): ok" (browser → Caddy → server).
- `npm run prod:logs` shows the server's migration message ("No migration found…") and then `WATCHPARTY server listening on http://localhost:4000`. Press Ctrl+C to stop following.
- No env files in the images:

  ```bash
  docker compose -f docker-compose.prod.yml --env-file deploy/production.env exec server ls -a
  docker compose -f docker-compose.prod.yml --env-file deploy/production.env exec client ls -a client
  ```

  Neither lists `.env` or `.env.local`.

Stop it when you're done:

```bash
npm run prod:down
```

(`prod:down` keeps the database volume. `docker compose -f docker-compose.prod.yml --env-file deploy/production.env down -v` deletes it.)

---


## Step 0 checklist

- [ ] `npm install` at the root installs every workspace
- [ ] `npm run db:up` starts Postgres and Mailpit; Mailpit UI loads on `:8025`
- [ ] `npm run dev` serves `/health` on `:4000` and the themed page on `:3000` with both checks "ok"
- [ ] `npm test` passes (shared 1, server 3, including the database test)
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm run build` produces `server/dist/index.js` and `client/.next/`
- [ ] `npm run prod:up` (local rehearsal) serves the page on `http://localhost` with both checks "ok"; only Caddy (and the rehearsal Mailpit) publish ports; no `.env` files in the images
- [ ] `server/package.json` has no `express`, `socket.io` or `nodemon`

## Commit

```bash
git add -A
git status          # make sure server/.env, client/.env.local and deploy/production.env are NOT listed
git commit -m "Set up workspaces, TypeScript, Docker, Next.js, Vitest, ESLint and the production stack"
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `docker compose up` fails with "port is already allocated" on 5432 | A local PostgreSQL service is running. Stop it (Windows Services → `postgresql-x64-…` → Stop), or change the mapping to `'5433:5432'` and use port 5433 in both URLs in `server/.env`. |
| `watchparty_test` doesn't exist | The volume was created before `init.sql` existed, so the script never ran. Run `docker compose down -v` (this **deletes** the database volume) and `docker compose up -d` again. |
| The database test fails with `P1001: Can't reach database server` | Postgres isn't running or isn't healthy yet: `docker compose ps`, wait for `healthy`, rerun `npm test`. |
| `npm run dev -w server` fails with `Invalid server/.env` | A value is missing or malformed; the message names the key. Compare with `server/.env.example`. |
| `node: bad option: --env-file` | Node is older than 20.6. Check `node -v`; install Node 22. |
| `create-next-app` fails with `unknown option` | Flag names differ between versions. Remove the flag it names and answer the matching question (TypeScript yes, ESLint yes, Tailwind no, `src/` yes, App Router yes, React Compiler no, alias `@/*`). |
| Next.js warns about multiple lockfiles, or picks the wrong workspace root | A `client/package-lock.json` exists. Delete it (and `client/node_modules`), then `npm install` from the root. |
| `Module not found: Can't resolve '@watchparty/shared'` in Next.js | Run `npm install` from the root and check `ls node_modules/@watchparty`. Make sure `transpilePackages` and `turbopack: { root: repoRoot }` are in `next.config.ts`. |
| "Rendered on the server: fetch failed" (or `ECONNREFUSED`) | The server isn't running on 4000, or `client/.env.local` is missing / has the wrong `INTERNAL_API_URL`. Restart `npm run dev` after editing `.env.local`. |
| "From the browser: Unexpected token '<'…" | The browser got an HTML page instead of JSON: the `/health` rewrite is missing from `next.config.ts`, or the server isn't running. |
| Build error: "You're importing a component that needs server-only" | A client component (`'use client'`) imports `lib/server/api.ts`. Only server components may import it. |
| Fonts fail to load / `next/font` download error | `next/font` needs internet the first time it fetches the fonts. Connect and restart `npm run dev`. |
| `client/.env.example` doesn't show up in `git status` | The generated `client/.gitignore` ignores `.env*`; add `!.env.example` below that line. |
| `Cannot find module '@watchparty/shared'` in the server | Run `npm install` from the **root**, not inside a workspace. |
| ESLint: "Cannot redefine plugin" | The root config is linting `client/`. Make sure `'client/**'` is in the root config's `ignores`. |
| Every file shows as changed after `npm run format` | Line endings. Make sure `.gitattributes` is committed, then `git add --renormalize .`. |
| `npm run build` fails on Windows with `EPERM: operation not permitted, symlink` | The standalone output copies the `@watchparty/shared` link. Turn on Windows Developer Mode (Settings → System → For developers), which allows symlinks, and build again. The Docker build runs on Linux and isn't affected. |
| `prod:up`: "Bind for 0.0.0.0:80 failed: port is already allocated" | Something on the host uses port 80 or 443 (IIS, another web server, a VPN client). Stop it, or for the rehearsal change the mappings to `'8080:80'` and use `SITE_ADDRESS=http://localhost:8080` and `PUBLIC_ORIGIN=http://localhost:8080`. |
| `prod:up`: "required variable … is missing a value" | `deploy/production.env` is missing or lacks that key. Compare with `deploy/production.env.example`. |
| `prod:up`: "Pool overlaps with other one on this address space" | Another Docker network already uses `172.28.0.0/24`. Pick a different subnet (for example `172.29.0.0/24`) in `docker-compose.prod.yml` and in the server's `TRUSTED_PROXIES`. |
| The server container restarts in a loop | Check `npm run prod:logs`. `Invalid server/.env` means a compose variable is wrong; a Prisma `P1000`/`P1001` error means the database credentials or the password's characters (use letters and digits only). |
| Docker build fails at `npm ci` with "lockfile … out of sync" | A `package.json` changed without updating the lockfile. Run `npm install` at the root and commit `package-lock.json`. |
| Docker build fails at `COPY … client/public` | `client/public/` doesn't exist in this checkout. `touch client/public/.gitkeep` and commit it. |
| `http://localhost` shows "Rendered on the server: fetch failed" in the rehearsal | The client container can't reach `server:4000`. Check `docker compose … ps` (server healthy?) and that `INTERNAL_API_URL` is `http://server:4000` in both the Dockerfile and the compose file. |
