# syntax=docker/dockerfile:1
#
# Dispatch — one image, two roles:
#   docker run ghcr.io/codextde/dispatch          web app (Next.js standalone server on :3000)
#   docker run ghcr.io/codextde/dispatch worker   background worker (IMAP sync, sending, rules, webhooks)
# See docker-compose.yml for the full stack and docs/self-hosting.md for details.

# ---------------------------------------------------------------------------
# base: Node + pnpm (via corepack) for the build stages
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install dependencies from the lockfile only (cached until it changes)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=dispatch-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: Next.js standalone output + bundled worker/migrate scripts (dist/)
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,id=dispatch-next-cache,target=/app/.next/cache \
    pnpm build

# ---------------------------------------------------------------------------
# runner: minimal runtime image, non-root
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

LABEL org.opencontainers.image.title="Dispatch" \
      org.opencontainers.image.description="The open-source collaborative inbox for teams: shared Gmail, Outlook and IMAP inboxes with comments, assignments and automation." \
      org.opencontainers.image.source="https://github.com/codextde/dispatch" \
      org.opencontainers.image.url="https://github.com/codextde/dispatch" \
      org.opencontainers.image.documentation="https://github.com/codextde/dispatch/tree/main/docs" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.vendor="Codext GmbH"

# tini: proper PID 1 (signal forwarding, zombie reaping)
RUN apk add --no-cache tini \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -D -H -u 1001 -G nodejs nextjs \
 && mkdir -p /data /secrets \
 && chown nextjs:nodejs /data

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    MIGRATIONS_DIR=/app/drizzle

# Next.js writes its runtime cache into .next, so the app user owns it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/docker-entrypoint
COPY --chmod=0755 docker/healthcheck.sh /usr/local/bin/dispatch-healthcheck

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=3s --retries=3 \
  CMD ["dispatch-healthcheck"]

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint"]
CMD ["web"]
