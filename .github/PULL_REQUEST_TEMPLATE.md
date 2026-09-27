## What does this change?

<!-- A short summary of the change and why it's needed. Link related issues: "Closes #123". -->

## How was it tested?

<!-- Steps you took to verify it works: manual testing, new tests, screenshots for UI changes. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass
- [ ] Every tenant query filters by `orgId`; conversation access goes through `src/server/access.ts`
- [ ] New mutations check permissions and are audited where it matters
- [ ] Database changes include a generated migration (`pnpm db:generate --name <change>`)
- [ ] UI works at 375px width and in dark mode
- [ ] Docs updated if behavior, configuration or the API changed
