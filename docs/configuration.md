# Configuration

Dispatch has almost no configuration files:

- **One environment variable:** `DOMAIN`.
- **Instance settings** are configured by super admins in the browser at `/admin/settings` and stored in the database.
- **Workspace settings** are configured by workspace admins under *Settings* in each workspace.

Secrets that other apps expect in `.env` files (database password, encryption key, session secret) are generated on first boot. Credentials you enter in the UI (SMTP passwords, OAuth client secrets, Stripe keys, AI keys) are stored encrypted in the database.

## Environment

### `DOMAIN` (required)

The public hostname of your instance, without protocol or path:

```bash
# .env
DOMAIN=mail.example.com
```

Dispatch builds its URLs from it: `https://mail.example.com`. `localhost` and `127.0.0.1` (e.g. `localhost:3000`) use `http://`. You can also pass a full URL such as `http://intranet.local:8080` if you really serve over plain HTTP.

On Coolify, `DOMAIN` falls back to the domain assigned to the `app` service. See [Coolify](coolify.md).

### Behind a reverse proxy

- **Secure cookies.** The session cookie's `Secure` flag follows the public URL from `DOMAIN` / `APP_URL`. The URL is `https://` unless the domain is `localhost` or `127.0.0.1`. Serve the instance over HTTPS so browsers send the cookie.
- **Client IP.** Rate limits, the audit log and the device list use the client IP, which comes from the proxy's headers:
  1. the **right-most** `X-Forwarded-For` entry, which is the hop appended by your proxy. Left-most entries are client-controlled and ignored.
  2. `X-Real-IP`, only when there is no `X-Forwarded-For` header at all.

  This assumes a **single trusted reverse proxy** directly in front of Dispatch (Traefik on Coolify, the bundled Caddy, or your nginx); all of them append the connecting address to `X-Forwarded-For` by default. With a CDN in front (e.g. Cloudflare → Traefik), the right-most hop is the CDN's edge address, so per-IP rate limits apply per edge location; configure your inner proxy to *replace* `X-Forwarded-For` with the real client address (e.g. Cloudflare's `CF-Connecting-IP`) if you need exact client IPs. Never publish port 3000 to the internet without a proxy, because clients could then send these headers themselves.

### `DISPATCH_VERSION` (compose only, optional)

The image tag used by `docker-compose.yml`, default `latest`. Pin a release such as `1.0.0` for predictable upgrades ([Upgrading](upgrading.md)).

### Advanced environment variables

You don't need these for a standard installation. They exist for special setups such as an external database, a secret manager, or several app replicas.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_URL` | `https://$DOMAIN` | Full public URL, if it differs from `https://$DOMAIN` (e.g. a non-standard port or a path prefix handled by your proxy) |
| `DATABASE_URL` | bundled `db` service | External PostgreSQL (14+), e.g. `postgres://user:pass@host:5432/dispatch?sslmode=require`. You can then remove the `db` service. |
| `DB_POOL_SIZE` | `10` | Max database connections per process (app and worker each have a pool) |
| `DATA_DIR` | `/data` | Persistent directory for the master key and local attachments |
| `DISPATCH_SECRET` | generated `master.key` | Master secret (at least 32 characters) from your secret manager instead of `$DATA_DIR/secrets/master.key`. See the warning below. |
| `SKIP_MIGRATIONS` | unset | `true` disables automatic migrations on start. Run `docker compose run --rm app migrate` yourself, e.g. before scaling to several app replicas. |
| `PORT` | `3000` | Port the app listens on inside the container |
| `SECRETS_DIR` / `DB_HOST` | `/secrets` / `db` | Where the generated database password is read from, and the bundled database's hostname |

> **Don't change the master secret on an existing instance.** Everything encrypted with the old key (mailbox credentials, OAuth tokens, stored API keys) becomes unreadable. Choose between the generated key file and `DISPATCH_SECRET` before the first start. To move the generated key into a secret manager, set `DISPATCH_SECRET` to the **exact contents** of `master.key`.

To set advanced variables with Docker Compose, add them in `docker-compose.override.yml`:

```yaml
services:
  app:
    environment:
      DATABASE_URL: postgres://dispatch:secret@db.internal:5432/dispatch
  worker:
    environment:
      DATABASE_URL: postgres://dispatch:secret@db.internal:5432/dispatch
```

The app and worker must always share the same `DATABASE_URL`, master key (`dispatch-data` volume or `DISPATCH_SECRET`) and `DOMAIN`.

## Instance settings (`/admin/settings`)

Super admins configure the instance at `/admin/settings/<section>`, e.g. `/admin/settings/email`. The setup wizard covers the essentials. Everything has safe defaults.

| Section | What you configure |
| --- | --- |
| **General** | Instance name and **mode**. *Private* (default): one company, invite-only, no public marketing site. *SaaS*: public sign-up, marketing site and optional billing. Also the support email, default timezone and an announcement banner shown to all users. |
| **Sign-in & sessions** (`authentication`) | Who can sign up: *invite only* (default), *open*, or *allowed email domains*. Who may create workspaces. Session length (default 365 days), sign-in link validity (default 15 minutes), and Google / Microsoft sign-in. |
| **Email** | Delivery of system emails: *log* (default, printed to logs), *SMTP* or *Amazon SES*, plus sender name/address and reply-to. See [Email delivery](email-delivery.md). |
| **OAuth** | Google and Microsoft OAuth apps, used for social sign-in and for connecting Gmail / Microsoft 365 inboxes. See [Connecting inboxes](connecting-inboxes.md). |
| **Billing** | Stripe keys, price, trial and enforcement for SaaS mode. See [Billing](billing.md). |
| **Storage** | Attachments on local disk (`/data/storage`, default) or any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Hetzner, …: endpoint, region, bucket, keys, path-style). Includes a connection test, and the max attachment size (default 25 MB). |
| **AI** | Optional AI assistant (summaries, drafting). Provider (*Anthropic* or *OpenAI*), API key, model and custom base URL. You can also allow workspaces to bring their own key. Off by default. |
| **Branding** | Product name, logo, accent color and support URL, for white-labeling your instance. |
| **Security** | *Block private networks* (SSRF protection for IMAP/SMTP hosts and webhooks, recommended for SaaS), sign-in rate limit per hour, max sessions per user, and the remote images policy (*always*, *ask*, *never*). |
| **Legal** | Company name, imprint, privacy policy and terms of service, published as public pages. Needed if you run a public service, e.g. in Germany. |

Other admin pages. These are visible only to super admins; everyone else gets a 404.

| Page | What you do there |
| --- | --- |
| `/admin` | Overview: key numbers and a setup checklist |
| `/admin/workspaces` | All workspaces: plan and subscription (e.g. *comped*), trial, suspend, transfer ownership, delete, open |
| `/admin/users` | All users: grant super admin, disable, manage sessions, impersonate for support, delete |
| `/admin/audit` | Instance-wide audit log |
| `/admin/system` | Health, worker heartbeat, background jobs, inbox errors and versions |

## Workspace settings

Every workspace (`/w/<slug>`) has its own administration under *Settings*. Who can change what is controlled by [permissions](architecture.md#multi-tenancy-and-permissions).

| Area | What you configure | Permission |
| --- | --- | --- |
| General | Workspace name, URL slug, logo, defaults | Manage workspace settings |
| Members | Invite, change roles, suspend, remove | Invite / Manage members |
| Roles & permissions | Custom roles from the permission catalog | Manage roles & permissions |
| Teams | Groups of members, e.g. to share inboxes with | Manage teams |
| Inboxes | Connect mailboxes and grant access (read / reply / manage) | Manage shared inboxes |
| Labels, responses, signatures | Shared labels, canned responses with variables, enforced signatures | Manage labels / responses / signatures |
| Rules | Automation: conditions → actions | Manage rules |
| Integrations | API keys and webhooks ([API](api.md)) | Manage integrations |
| Billing | Subscription and invoices (SaaS mode only) | Manage billing |
| Audit log | Security-relevant actions in this workspace | View audit log |

Personal preferences (notifications, signature, theme, keyboard shortcuts, devices) are set by each user in their own profile settings.
