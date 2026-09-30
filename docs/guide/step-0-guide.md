# Step 0 guide: dev setup

A hands-on walkthrough of step 0 from [`watchparty_execution_plan.md`](./watchparty_execution_plan.md). Follow the parts in order; each one ends with a checkpoint. When every checkpoint passes, step 0 is done.

**What you'll have at the end:** one repository with three packages (`shared`, `server`, `client`) that install, lint, typecheck, test and run with one command each, plus Postgres and Mailpit running in Docker.

**Time:** about 1–2 hours.

**Shell:** the commands are written for Git Bash (the shell this project already uses). Run every command from the repository root (`d:/Projects/socket-learning`) unless the step says otherwise.

## Before you start

- [ ] Node 22 (`node -v` → `v22.x`) and npm 10 (`npm -v`).
- [ ] Docker Desktop is running (`docker ps` works without an error).
- [ ] Nothing is using ports 3000, 5173, 5432, 1025 or 8025. On Windows, check with `netstat -ano | grep -E ":(3000|5173|5432|1025|8025) "`; no output means they're free. A locally installed PostgreSQL service often holds 5432; stop it in Services, or see Troubleshooting.
- [ ] Create a branch: `git checkout -b step-0-dev-setup`.

## How the pieces fit

```
socket-learning/
├── package.json         ← root: lists the three workspaces, holds shared dev tools (TypeScript, ESLint, Prettier)
├── shared/              ← @watchparty/shared: code both sides import, used as TypeScript source (no build step)
├── server/              ← Node + TypeScript; run with tsx in dev, bundled with tsup for production
├── client/              ← Vite + React + TypeScript
└── docker-compose.yml   ← Postgres 16 (dev + test databases) and Mailpit (catches emails in dev)
```

npm **workspaces** mean there's one `node_modules/` and one `package-lock.json` at the root. `npm install` at the root installs all three packages, and `@watchparty/shared` is linked into `node_modules/` so `server` and `client` can `import ... from '@watchparty/shared'`.

---

## Part 1: clean up the old server

The old Express/Socket.IO dependencies are replaced. The old code itself was already deleted (you can still read it with `git show 42ab038:server/index.js`).

```bash
rm -rf server/node_modules server/package-lock.json server/package.json
```

Leave `server/.env` and `server/.env.example` for now; you'll overwrite them in Part 5.

**Checkpoint:** `ls server` shows only `.env` and `.env.example` (use `ls -a`).

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
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:migrate": "npm run db:migrate -w server",
    "db:reset": "npm run db:reset -w server",
    "db:seed": "npm run db:seed -w server"
  }
}
```

Why: `-w server` runs a script inside that workspace; `--workspaces --if-present` runs it in every workspace that defines it.

### `tsconfig.base.json`

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

Why: `moduleResolution: "Bundler"` lets you write `import { x } from './file'` without a `.js` suffix; `tsx`, `tsup`, Vite and Vitest all understand it. `noEmit` because TypeScript only type-checks here; other tools produce the JavaScript.

### `.gitattributes`

```
* text=auto eol=lf
*.png binary
*.pdf binary
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
coverage
package-lock.json
server/prisma/migrations
docs/**/*.html
*.png
*.pdf
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
coverage/
*.tsbuildinfo

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

Why: `exports` points straight at the TypeScript source. Vite, `tsx`, `tsup` and Vitest all compile TypeScript themselves, so `shared` never needs its own build.

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

(`APP_NAME` is only there so Part 7's checkpoint can prove both the server and the client import from `shared`.)

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

Why: `tsx watch` restarts the server when you save a file. `--env-file` is built into Node 22, so no `dotenv` package is needed. `--noExternal @watchparty/shared` tells `tsup` to bundle the shared source into the output, because it isn't a built package.

`db:seed` points at a file that arrives in step 2; that's expected.

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
PORT=3000
DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty
TEST_DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty_test
ALLOWED_ORIGINS=http://localhost:5173
SESSION_TTL_DAYS=30
TRUST_PROXY=false
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

The admin values can stay empty until step 2. `.env` is git-ignored; `.env.example` is committed.

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

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  TEST_DATABASE_URL: z.url().optional(),
  ALLOWED_ORIGINS: list,
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TRUST_PROXY: bool,
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

Why a separate `app.ts`: tests import `createServer()` and listen on a random port, without reading `.env` or taking port 3000. The WebSocket upgrade handler is attached here in step 1.

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

## Part 6: the client package

### Scaffold with Vite

```bash
npm create vite@latest client -- --template react-ts
```

If it asks questions:
- "Use rolldown-vite / experimental?" → **No**
- "Install with npm and start now?" → **No** (you'll install everything at once in Part 7)

### Remove what the root already provides or you don't need

The template ships its own ESLint setup; the root config (Part 8) replaces it.

```bash
rm -f client/eslint.config.js client/src/App.css client/src/index.css client/README.md
rm -rf client/src/assets
```

Open `client/package.json` and:
- delete the `"lint"` script;
- delete these from `devDependencies`: `eslint`, `@eslint/js`, `globals`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (whichever are present);
- add `"typecheck": "tsc -b"` to `scripts`.

The template's `tsconfig.json`, `tsconfig.app.json` and `tsconfig.node.json` stay as they are; they're already strict and set up for Vite.

### `client/vite.config.ts`

Replace the file with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

Why: in dev the browser only talks to `:5173`; Vite forwards `/auth`, `/health` and `/ws` to the server. Same origin means cookies (step 2) work without CORS setup.

If the template generated `@vitejs/plugin-react-swc` instead of `@vitejs/plugin-react`, keep whichever import the template used.

### `client/src/styles/tokens.css`

```bash
mkdir -p client/src/styles client/src/app
```

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

  --font-display: 'Barlow Condensed', system-ui, sans-serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-num: 'JetBrains Mono', ui-monospace, monospace;

  --radius: 10px;
}
```

These come straight from the theme sample mockup.

### `client/src/styles/global.css`

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  background: var(--ground);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
h3 {
  font-family: var(--font-display);
  font-weight: 600;
  margin: 0;
}

button,
input {
  font: inherit;
}
```

### `client/src/main.tsx`

Replace the file with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### `client/src/app/App.tsx`

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### `client/src/app/HomePage.tsx`

```tsx
import { useEffect, useState } from 'react';
import { APP_NAME } from '@watchparty/shared';
import styles from './HomePage.module.css';

type Health = { state: 'loading' } | { state: 'ok' } | { state: 'error'; message: string };

export function HomePage() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });

  useEffect(() => {
    fetch('/health')
      .then(async (res) => {
        const body = (await res.json()) as { ok?: boolean };
        setHealth(body.ok ? { state: 'ok' } : { state: 'error', message: `HTTP ${res.status}` });
      })
      .catch((error: unknown) => setHealth({ state: 'error', message: String(error) }));
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.logo}>
        WATCH<span>PARTY</span>
      </h1>
      <p className={styles.muted}>Shared package says: {APP_NAME}</p>
      <p className={styles.status}>
        Server:{' '}
        {health.state === 'loading' && 'checking…'}
        {health.state === 'ok' && <span className={styles.ok}>ok</span>}
        {health.state === 'error' && <span className={styles.error}>{health.message}</span>}
      </p>
    </main>
  );
}
```

### `client/src/app/HomePage.module.css`

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
  font-family: var(--font-num);
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
# Root: shared dev tools
npm install -D typescript concurrently prettier eslint@9 @eslint/js typescript-eslint \
  eslint-plugin-react-hooks eslint-plugin-react-refresh globals eslint-config-prettier

# Shared
npm install -w shared zod@4
npm install -w shared -D vitest

# Server
npm install -w server ws zod@4 @prisma/client@6
npm install -w server -D prisma@6 tsx tsup vitest @types/node@22 @types/ws

# Client (the template's own dependencies are installed by this too)
npm install -w client react-router-dom zustand \
  @fontsource/barlow-condensed @fontsource/ibm-plex-sans @fontsource/jetbrains-mono
```

Now link the shared package by hand. `npm install @watchparty/shared` would look for it on the public registry, so instead add this line to the `"dependencies"` block of **both** `server/package.json` and `client/package.json`:

```json
"@watchparty/shared": "*"
```

Then run a plain install from the root so npm links it:

```bash
npm install
```

Why the pinned majors: Prisma 6 because Prisma 7 changes how the client is generated; zod 4 because `config.ts` uses zod 4's `z.url()`; ESLint 9 because the config in Part 8 is written for it; `@types/node@22` to match your Node version.

**Checkpoint**
- There's a single `package-lock.json` at the root and none inside `server/`, `client/` or `shared/`.
- `ls node_modules/@watchparty` shows `shared` (it's a link to your `shared/` folder).
- `server/package.json` contains no `express`, `socket.io` or `nodemon`:
  `grep -E "express|socket.io|nodemon" server/package.json` prints nothing.

---

## Part 8: ESLint

### `eslint.config.js` (repository root)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage', '**/node_modules', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettier,
);
```

Why: one config for the whole repository. `eslint-config-prettier` goes last so ESLint never complains about formatting that Prettier owns.

---

## Part 9: README

Replace `README.md` with:

````markdown
# Watch party

A watch-party app: synced YouTube/Twitch playback, live chat and play-point betting windows.

## Docs

- `docs/watchparty_app_project-structure.md` — the design (rules, schema, protocol, file tree)
- `docs/watchparty_phases.md` — phases, scope and exit criteria
- `docs/watchparty_execution_plan.md` — step-by-step tasks

## Prerequisites

Node 22, npm 10, Docker Desktop.

## Run it

```bash
npm install
cp server/.env.example server/.env   # first time only
npm run db:up                        # Postgres + Mailpit (UI on http://localhost:8025)
npm run dev                          # server :3000, client http://localhost:5173
```

## Checks

```bash
npm run lint
npm run typecheck
npm test
```
````

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
- `lint`: no errors (a few `react-refresh` warnings are fine).
- `typecheck`: no output from `shared`, `server` or `client` besides the script headers.
- `test`: `shared` 1 passed; `server` 3 passed (health ×2, database ×1).

Then run the app:

```bash
npm run dev
```

- The terminal shows `WATCHPARTY server listening on http://localhost:3000` (blue) and the Vite URL (magenta).
- `http://localhost:3000/health` shows `{"ok":true}`.
- `http://localhost:5173` shows the gold-and-white **WATCHPARTY** logo in Barlow Condensed on the dark background, "Shared package says: WATCHPARTY", and "Server: ok" in green.
- Stop the server with Ctrl+C: the client page (after a refresh) shows the error in red. Start it again and it returns to "ok".
- Break the config on purpose: set `PORT=abc` in `server/.env`, run `npm run dev -w server`, and confirm it exits with `Invalid server/.env: PORT: ...`. Put it back.

Finally, the production build:

```bash
npm run build
```

- `server/dist/index.js` exists (one file, with `shared` bundled in).
- `client/dist/` contains `index.html` and `assets/`.

### Step 0 checklist

- [ ] `npm install` at the root installs every workspace
- [ ] `npm run db:up` starts Postgres and Mailpit; Mailpit UI loads on `:8025`
- [ ] `npm run dev` serves `/health` on `:3000` and the themed placeholder on `:5173` showing "Server: ok"
- [ ] `npm test` passes (shared 1, server 3, including the database test)
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm run build` produces `server/dist/index.js` and `client/dist/`
- [ ] `server/package.json` has no `express`, `socket.io` or `nodemon`

### Commit

```bash
git add -A
git status          # make sure server/.env is NOT listed
git commit -m "Set up workspaces, TypeScript, Docker, Vite, Vitest and ESLint"
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
| Client shows "Server: Unexpected token '<'…" | The request didn't reach the server: the server isn't running, or `vite.config.ts` lacks the `/health` proxy. |
| `Cannot find module '@watchparty/shared'` | Run `npm install` from the **root**, not inside a workspace. Check `ls node_modules/@watchparty`. |
| TypeScript error in `client` about `@watchparty/shared` | Make sure `shared/package.json` has `"exports": { ".": "./src/index.ts" }` and `shared/src/index.ts` exists. |
| ESLint: "Cannot find package 'typescript-eslint'" | Install it at the root (`npm install -D typescript-eslint` without `-w`). |
| Every file shows as changed after `npm run format` | Line endings. Make sure `.gitattributes` is committed, then `git add --renormalize .`. |
| `npm create vite` created files in the wrong place | It must be run from the root with `client` as the name; the `client/` folder must be empty. |
