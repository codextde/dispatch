# Security

This page describes how Dispatch protects your data and what you should do as an operator. To report a vulnerability, see [SECURITY.md](../SECURITY.md). Please report privately, never in a public issue.

## What Dispatch protects

A Dispatch instance has access to full mailboxes. The most sensitive assets are:

1. **Mailbox credentials:** IMAP/SMTP passwords and OAuth refresh tokens for Gmail and Microsoft 365
2. **Email content:** messages, attachments and internal comments
3. **Instance secrets:** the master key, API keys, webhook secrets, and Stripe, AI and SMTP credentials
4. **Sessions:** a stolen session cookie grants access for up to a year

## Threat model and controls

| Threat | Controls |
| --- | --- |
| **Instance takeover after deployment** | The first-run wizard requires a one-time setup code that is printed only to the server logs, so a stranger who finds a fresh instance can't make themselves its owner. |
| **Account takeover** | Passwordless login: no passwords to phish or reuse. Magic links and codes are single-use, expire after 15 minutes (configurable), are stored only as hashes and are rate-limited per email and IP. Optional Google / Microsoft sign-in. |
| **Session theft** | 256-bit random tokens, stored as SHA-256 hashes. `httpOnly` cookies, `Secure` on HTTPS, `SameSite=Lax`. Users see their devices and can revoke any session, and admins can cap sessions per user. |
| **Cross-tenant access** | Every tenant query is scoped by workspace (`org_id`), and conversation visibility goes through one access layer (`src/server/access.ts`). Realtime events carry only IDs, and clients refetch through the same permission checks. |
| **Privilege escalation** | Role-based permissions checked on the server for every page, server action and API route. Inbox access (read / reply / manage) is separate from roles. |
| **Malicious email content** | Email HTML is sanitized and rendered in a sandboxed iframe without script execution. Remote images (tracking pixels) are blocked, asked for, or allowed per instance policy. A strict Content Security Policy applies to the app itself. |
| **CSRF / clickjacking** | Same-origin checks on cookie-authenticated mutations, built-in origin checks for server actions, `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| **SSRF** | *Admin → Settings → Security → Block private networks* refuses IMAP/SMTP hosts and webhook URLs that resolve to private, loopback or link-local addresses. |
| **Leaked database dump** | Credentials and tokens are encrypted with AES-256-GCM, with keys derived via HKDF from the master key, which is stored outside the database. API keys and session tokens are stored only as hashes. |
| **Webhook spoofing** | Every webhook is signed with HMAC-SHA256 over a timestamp and the raw body. Receivers should verify it and reject old timestamps ([API](api.md#verifying-signatures)). |
| **Container breakout impact** | The app and worker run as an unprivileged user (uid 1001). Postgres isn't published on the host, and its password is random per installation. |
| **Brute force & abuse** | Rate limits on sign-in requests (per email and per IP) and code attempts. Audit log of security-relevant actions per workspace. |

## Operator checklist

- **Use HTTPS.** Dispatch marks cookies `Secure` only when its URL is `https://` (the default for any `DOMAIN` other than `localhost`). Coolify, the bundled Caddy override and the proxy examples all terminate TLS.
- **Keep the server patched** and update Dispatch regularly ([Upgrading](upgrading.md)). Watch the repository for security advisories.
- **Protect the master key.**
  - `/data/secrets/master.key` decrypts all stored credentials. Back it up separately from database dumps and restrict access to the `dispatch-data` volume.
  - Alternatively, provide it via `DISPATCH_SECRET` from a secret manager. See [Configuration](configuration.md#advanced-environment-variables).
- **Don't publish the database port.** The default compose file doesn't.
- **Enable *Block private networks*** on any instance where users you don't fully trust can add inboxes or webhooks (always for SaaS).
- **Complete the setup wizard soon after the first start.** The setup code from the logs (`docker compose logs app | grep -A2 "setup code"`) keeps strangers out, but treat those logs as sensitive until setup is done.
- **Run exactly one trusted reverse proxy in front of the app** (Traefik, Caddy, nginx), and don't expose port 3000 directly. Dispatch trusts the proxy's `X-Real-IP` / `X-Forwarded-For` headers for rate limiting and audit logs ([Configuration](configuration.md#behind-a-reverse-proxy)).
- **Configure SPF, DKIM and DMARC** for the system email sender ([Email delivery](email-delivery.md)).
- **Review the audit log** and active sessions of admins periodically.

## Data handling

- Mail stays in the original mailbox. Dispatch stores a synced copy (headers, bodies, attachments) in Postgres and the configured storage.
- Dispatch has no telemetry. It doesn't phone home, and Next.js telemetry is disabled in the image.
- The AI assistant is off by default. When enabled, the conversation text a user asks about is sent to the configured provider (Anthropic or OpenAI) with the admin's own API key.
- Stripe is only contacted when billing is enabled (SaaS mode).
