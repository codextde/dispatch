# Contributing to Dispatch

Thanks for helping make Dispatch better! Bug reports, documentation fixes, translations, design feedback and code are all welcome.

## Ways to contribute

- **Report a bug:** [open an issue](https://github.com/codextde/dispatch/issues/new/choose) with steps to reproduce. For security issues, follow [SECURITY.md](SECURITY.md) instead.
- **Suggest a feature:** start in [Discussions](https://github.com/codextde/dispatch/discussions) or open a feature request.
- **Improve the docs:** everything in `docs/` is plain Markdown. Small fixes can go straight to a pull request.
- **Write code:** pick an issue labeled `good first issue` or `help wanted`. For anything bigger than a small fix, comment on the issue or open a discussion first, so we can agree on the approach before you invest time.

## Development setup

You need Node.js 24, pnpm 9.15 (`corepack enable`) and Docker.

```bash
git clone https://github.com/codextde/dispatch.git && cd dispatch
corepack enable && pnpm install
pnpm services      # Postgres, Mailpit (SMTP catcher), GreenMail (IMAP/SMTP test server)
pnpm db:migrate
pnpm dev           # http://localhost:3000, then create the first admin at /setup
pnpm dev:worker    # in a second terminal
```

[docs/development.md](docs/development.md) explains the local mail servers, helper commands and project structure.

## Guidelines

Read [AGENTS.md](AGENTS.md). It is the source of truth for the project's conventions. The most important rules:

- **Next.js 16 is different.** `params`, `cookies()` and `headers()` are async, and middleware is `src/proxy.ts`. Check `node_modules/next/dist/docs/` rather than relying on memory of older versions.
- **Tenant isolation is non-negotiable.** Every query on tenant data filters by `orgId`. Conversation visibility goes through `src/server/access.ts`.
- **Check permissions on the server** in every page, server action and route handler, using the helpers in `src/server/authz.ts` and `src/server/api.ts`.
- **No new environment variables.** Configuration belongs in the instance or workspace settings, so it can be changed in the UI. Secrets are stored encrypted.
- **Database changes:** edit `src/server/db/schema.ts`, then run `pnpm db:generate --name <change>`. Commit the generated migration and don't edit migrations that were already released.
- **UI:**
  - Every screen must work at 375px width, in light and dark mode, and with the keyboard.
  - Use shadcn/ui primitives from `src/components/ui` and the design tokens described in AGENTS.md.
- **Keep changes focused.** One topic per pull request, no drive-by reformatting of unrelated code. Match the style of the surrounding code (Prettier with the Tailwind plugin, no semicolons, double quotes).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org):

```text
feat(inbox): add bulk snooze
fix(worker): reconnect IMAP after server-side timeout
docs(coolify): clarify port suffix in domains
```

Common types:

- `feat`, `fix`, `docs`, `refactor`, `perf`, `test`
- `build` (Docker, dependencies) and `ci`
- `chore` for anything else

Mark breaking changes with `!` (`feat(api)!: …`) and explain them in the body.

## Pull request checklist

Before opening a pull request:

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass
- [ ] New logic has tests where it's practical (pure functions, parsers, permission checks)
- [ ] UI changes include screenshots (desktop and mobile, light and dark if relevant)
- [ ] Database changes include a migration and work on an existing database
- [ ] Docs are updated when behavior, configuration or the API changes
- [ ] The PR description explains *why*, and links the issue (`Closes #123`)

CI runs typecheck, lint, tests and a production build on every pull request. A maintainer will review, may ask for changes, and squash-merges when ready.

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE), the license of this project.
