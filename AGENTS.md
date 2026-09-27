<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dispatch — project conventions

Dispatch is an open-source collaborative inbox (shared inboxes, internal comments, assignments,
rules) — a self-hostable alternative to Missive/Front. Single Next.js 16 app + a worker process.

## Stack
- Next.js 16 (App Router, Turbopack, `src/proxy.ts` instead of middleware), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (radix, `src/components/ui/*`), lucide-react icons, motion, sonner toasts
- PostgreSQL + Drizzle ORM (`src/server/db/schema.ts`), postgres.js driver
- TanStack Query for client data, SSE + Postgres LISTEN/NOTIFY for realtime (no Redis)
- imapflow / mailparser / nodemailer for mail; worker in `src/worker` (separate container)

## Next.js 16 rules (breaking changes vs. older versions)
- `params` / `searchParams` / `cookies()` / `headers()` are **async** — always `await` them.
- Use the generated global helpers `PageProps<"/w/[slug]/inbox">`, `LayoutProps<"/w/[slug]">`, and
  `RouteContext<"/api/w/[slug]/x">` for typing. Run `pnpm next typegen` after adding routes.
- Middleware is called Proxy (`src/proxy.ts`). Parallel routes need `default.tsx`.
- Docs for this exact version: `node_modules/next/dist/docs/`.

## Layout of the code
- `src/server/**` — server-only modules (`import "server-only"`). Never import from client components.
  - `db` (`db`, `schema`), `env`, `crypto` (encrypt/decrypt/hash/tokens), `settings` (instance settings),
    `auth/session`, `auth/magic-link`, `authz` (org context + permissions), `access` (inbox visibility),
    `api` (route helpers), `action` (server action helper), `audit`, `realtime` (publish/subscribe),
    `jobs` (enqueueJob, emitWebhook), `notifications` (notify), `storage` (attachments), `orgs`
- `src/lib/**` — isomorphic helpers (`utils`, `permissions`, `api-client`)
- `src/components/ui` — shadcn primitives. `src/components/app` — shared app chrome (OrgProvider,
  UserMenu, WorkspaceSwitcher, UserAvatar). Feature components live in `src/components/<area>/`.

## Auth & authorization patterns
- Pages/layouts: `const ctx = await requireOrgPage(slug)`; `requirePagePermission(ctx, "members.manage")`.
- Server actions: `"use server"`, wrap with `action(zodSchema, async (input) => {...})`, inside call
  `const ctx = await requireOrg(input.slug)`, `assertPermission(ctx, "...")`, `assertWritable(ctx)`.
- Route handlers: `export const GET = route<{ slug: string }>(async (req, { params }) => { const ctx = await requireApiOrg(req, (await params).slug); ... return json(data) })`.
  Throw `new ApiError(status, message)` for errors. Cookie-auth mutations are CSRF-checked automatically.
- Super admin: `requireSuperAdminPage()` / `requireSuperAdmin()` / `requireApiSuperAdmin(req)`.
- Every tenant query MUST filter by `orgId`. Conversation visibility MUST go through `src/server/access.ts`.
- Audit important mutations with `audit({ orgId, actorId, action: "resource.verb", targetType, targetId, metadata })`.
- After mutations that other users should see: `publish({ orgId, type, conversationId })` (clients refetch).
- Secrets are stored encrypted (`encrypt`/`encryptJson`); never return secrets to the client (`redactSecrets`).

## Configuration philosophy
- `.env` contains only `DOMAIN`. Everything else is configured in the UI (instance settings in
  `/admin`, workspace settings in `/w/[slug]/settings`) and stored in Postgres.
- Instance settings: `getSettings("email" | "auth" | "general" | "billing" | "oauth" | "storage" | "ai" | "branding" | "security" | "legal" | "setup")`.

## UI / design language (inspired by editorial SaaS sites, 2026 style)
- Warm paper palette: `bg-background` (#FAF9F5), `bg-surface`, `bg-card` (white), ink `foreground`,
  signal green accent `brand` (`text-brand`, `bg-brand`, `bg-brand-soft`). Full dark mode support is required.
- Headings: tight tracking (`tracking-tight` / `.tracking-display`), two-tone with `<span className="text-quiet">`.
- Small labels: `font-mono text-[11px] uppercase tracking-wider text-muted-foreground`.
- App UI is dense but calm: 13–14px text, hairline borders, subtle hover states, generous empty states.
- Mobile first: every screen must work at 375px width (stack panes, sheets/drawers instead of side panels,
  bottom-safe-area padding). Use `useIsMobile()` from `@/hooks/use-mobile` when needed.
- Accessible: labelled inputs, focus rings, keyboard navigation, `aria-*` on icon buttons.

## Database changes
- Edit `src/server/db/schema.ts`, then `pnpm db:generate --name <change>` and `pnpm db:migrate`.
- Migrations run automatically on container start.

## Commands
- `pnpm dev` (web), `pnpm dev:worker` (worker), `pnpm services` (Postgres/Mailpit/GreenMail via Docker)
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`
- `pnpm dev:session you@example.com --super-admin --org "Acme"` prints a session cookie for API testing.
