# Development

This guide gets Dispatch running locally and explains how the code is organized. For contribution rules (commits, pull requests), see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

- Node.js 24 (LTS). Newer versions work too.
- pnpm 9.15 (`corepack enable` picks the version from `package.json`)
- Docker, for Postgres and the mail test servers

## Setup

```bash
git clone https://github.com/codextde/dispatch.git
cd dispatch
corepack enable
pnpm install

pnpm services        # Postgres, Mailpit and GreenMail via docker-compose.dev.yml
pnpm db:migrate      # apply migrations to the local database
pnpm dev             # web app on http://localhost:3000
pnpm dev:worker      # background worker (second terminal)
```

Open http://localhost:3000/setup to create the first super admin. No `.env` is needed for development: Dispatch defaults to `postgres://dispatch:dispatch@localhost:5432/dispatch` and stores local data (master key, attachments) in `./.data`.

### Local services

`pnpm services` starts these from `docker-compose.dev.yml`:

| Service | Address | Use |
| --- | --- | --- |
| PostgreSQL 17 | `localhost:5432`, user/password/db `dispatch` | Application database |
| Mailpit | UI http://localhost:8025, SMTP `localhost:1025` | Catches system emails (sign-in links, invitations). Set Admin → Settings → Email to SMTP `localhost:1025`, no auth, no TLS |
| GreenMail | IMAP `localhost:3143`, SMTP `localhost:3025` | Test mailbox server. Any user/password is accepted and created on first login |

To connect a test inbox, use the "Other (IMAP/SMTP)" preset with IMAP `localhost:3143` and SMTP `localhost:3025`, TLS off, e.g. user `support@localhost` with any password. Mail sent to that address via GreenMail's SMTP arrives in the inbox.

Emails are printed to the terminal while no email provider is configured (the default "log" mode).

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm dev:worker` | Web app / worker in watch mode |
| `pnpm typecheck` | TypeScript (`pnpm next typegen` first after adding routes) |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm build` | Production build: Next.js standalone + `dist/worker.mjs` + `dist/migrate.mjs` |
| `pnpm db:generate --name <change>` | Create a migration after editing `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio (database browser) |
| `pnpm dev:session you@example.com --super-admin --org "Acme"` | Create a user/workspace and print a session cookie for testing the API with `curl` |

Demo data (the "Northwind" workspace content) can be seeded into a workspace with:

```bash
pnpm tsx --conditions=react-server scripts/seed-demo.ts <workspace-slug> <your-email>
```

## Project structure

```text
src/
  app/                  Next.js App Router: pages, layouts and route handlers
    api/                JSON API (/api/w/<slug>/...), OAuth callbacks, Stripe webhook, health
    w/[slug]/           the app, one workspace per slug
    admin/              instance administration (super admins)
  components/
    ui/                 shadcn/ui primitives
    app/                shared app chrome (workspace switcher, user menu, ...)
    <area>/             feature components
  server/               server-only modules (import "server-only")
    db/                 Drizzle schema + client
    env.ts crypto.ts    runtime environment, encryption and tokens
    settings.ts         instance settings (zod schemas with defaults)
    authz.ts access.ts  workspace context, permissions, inbox visibility
    api.ts action.ts    route handler and server action helpers
    realtime.ts jobs.ts LISTEN/NOTIFY events, background jobs and webhooks
    mail/ oauth/        mail connections, credentials, OAuth providers
  lib/                  isomorphic helpers (permissions, utils, API client)
  worker/               background worker entry (IMAP sync, sending, rules, webhooks)
  proxy.ts              Next.js 16 proxy (formerly middleware)
drizzle/                SQL migrations (generated)
scripts/                migrate, dev-session, seed-demo, build-worker
docker/                 container entrypoint and health check
```

See [Architecture](architecture.md) for how the pieces fit together.

## Conventions

The full list lives in [AGENTS.md](../AGENTS.md). The essentials:

- **Next.js 16.** `params`, `searchParams`, `cookies()` and `headers()` are async. Middleware is `src/proxy.ts`. Read `node_modules/next/dist/docs/` when in doubt: APIs differ from older versions.
- **Tenancy.** Every tenant query filters by `orgId`. Conversation visibility always goes through `src/server/access.ts`.
- **Authorization.**
  - Pages: `requireOrgPage(slug)` and `requirePagePermission`.
  - Server actions: `action(zodSchema, ...)`, then `requireOrg`, `assertPermission` and `assertWritable`.
  - Route handlers: `route(...)` with `requireApiOrg`. Errors are thrown as `ApiError`.
- **Secrets.** Store them encrypted (`encrypt` / `encryptJson`, `*Enc` settings fields). Never send them to the client (`redactSecrets`).
- **Side effects.** Audit important mutations with `audit(...)`. Call `publish(...)` after changes other users should see, and `emitWebhook(...)` for public events.
- **Configuration.** Nothing new goes into environment variables. Add a field to the relevant settings schema instead, so it's configurable in the UI.
- **UI.**
  - Every screen works at 375px width and in dark mode.
  - Use accessible labels and keyboard navigation.
  - Follow the design tokens (`bg-background`, `text-brand`, ...).

## Building the Docker image locally

```bash
docker build -t ghcr.io/codextde/dispatch:dev .
echo "DISPATCH_VERSION=dev" >> .env      # next to docker-compose.yml
docker compose up -d
```

The image is multi-stage. It installs with `pnpm install --frozen-lockfile` and runs `pnpm build`. The runtime stage contains only the Next.js standalone output, `dist/`, `drizzle/` and `public/`, and runs as the unprivileged user `nextjs` (uid 1001).
