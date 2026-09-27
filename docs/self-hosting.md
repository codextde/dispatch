# Self-hosting

Dispatch runs anywhere Docker runs. The stack is three containers (app, worker and PostgreSQL) described in a single `docker-compose.yml`. The only thing you configure in a file is your domain. Secrets are generated on first boot, and everything else is set up in the browser.

Using Coolify? Follow the [Coolify guide](coolify.md) instead.

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [First-run setup](#first-run-setup)
- [Reverse proxy & TLS](#reverse-proxy--tls)
- [Where data and secrets live](#where-data-and-secrets-live)
- [Operations: logs, updates, backups](#operations)
- [Troubleshooting](#troubleshooting)

## Requirements

| | Minimum | Recommended |
| --- | --- | --- |
| CPU | 1 vCPU | 2 vCPU |
| Memory | 1 GB | 2 GB+ |
| Disk | 10 GB | 20 GB + expected mail and attachments |
| Architecture | `amd64` or `arm64` | |

You also need:

- Docker Engine 24+ with the Compose plugin (`docker compose version`)
- A domain or subdomain, e.g. `mail.example.com`, with an `A`/`AAAA` record pointing to the server
- Ports 80 and 443 reachable from the internet (for HTTPS certificates), and outbound access to your mail providers' IMAP (993) and SMTP (465/587) ports

A small cloud VM (e.g. 2 vCPU / 4 GB) comfortably serves a team of dozens with several shared inboxes. Memory grows mainly with the number of connected inboxes that the worker keeps in sync.

## Quick start

```bash
mkdir -p /opt/dispatch && cd /opt/dispatch

# 1. Get the compose file and the Caddy override (automatic HTTPS)
curl -fsSLO https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.override.example.yml -o docker-compose.override.yml

# 2. Set your domain (the only setting)
echo "DOMAIN=mail.example.com" > .env

# 3. Start
docker compose up -d
```

Then open **https://mail.example.com/setup** and enter the one-time setup code from `docker compose logs app | grep -A2 "setup code"` ([First-run setup](#first-run-setup)). The first start takes a moment: Postgres initializes, migrations run, and Caddy obtains a certificate.

Check that everything is healthy:

```bash
docker compose ps                                # app, worker, db (and caddy) should be "healthy" / "running"
curl -s https://mail.example.com/api/health      # {"status":"ok","version":"…","db":"ok","uptime":…}
```

Already running a reverse proxy? Skip the override file and see [Reverse proxy & TLS](#reverse-proxy--tls).

> **Trying it locally?** `DOMAIN=localhost:3000` with the override's "Option B" (publish `127.0.0.1:3000:3000`) gives you `http://localhost:3000`.

## First-run setup

The setup wizard at `/setup` runs once. Before anything else, it asks for a one-time **setup code**. While setup isn't complete, Dispatch prints the code to the app logs on start, in a box with the line `Dispatch first-run setup code: XXXX-XXXX-XXXX`:

```bash
docker compose logs app | grep -A2 "setup code"
```

If several codes appear (e.g. after a restart), use the most recent one. Then:

1. **Welcome & system check.** Confirms the database connection, that the data directory is writable, and the public URL (HTTPS).
2. **Owner account.** Enter your name and email. This creates the super admin and signs you in right away; no email needed.
3. **Instance.**
   - Instance name.
   - Mode: *Private* (just your company) or *Public SaaS*.
   - Who can sign up: invite only, allowed email domains, or anyone.
   - Whether the public website is shown.
4. **Email delivery.** Amazon SES, SMTP or *Log only*, with a **Send test email** button. You can skip this and configure it later.
5. **First workspace.** Name and URL, optionally with demo data to explore. Finishing takes you to the workspace inbox.

If you lose your session halfway through, `/setup` asks you to sign in and resumes where you left off. After completion, `/setup` redirects to the app.

> **Why a setup code?** A freshly deployed instance is reachable by anyone who knows its URL. Only someone who can read the server logs can get the code, so strangers can't claim your instance as its owner. The code is no longer needed once setup is complete.

Until email delivery is configured (provider *Log only*), Dispatch doesn't send emails. It prints them to the logs in a box titled `Dispatch email (not delivered)`, which includes sign-in links and 6-digit codes for later sign-ins:

```bash
docker compose logs -f app | grep -A12 "Dispatch email"
```

Configure SMTP or Amazon SES in **Admin → Settings → Email** before inviting your team ([Email delivery](email-delivery.md)). Then connect your mailboxes ([Connecting inboxes](connecting-inboxes.md)).

Everything else is configured in the UI:

- The instance, at `/admin`: sign-in, OAuth apps, storage, AI, branding, security, legal pages and billing.
- Each workspace, under *Settings*: members, roles, teams, inboxes, labels, rules and integrations.

See [Configuration](configuration.md).

## Reverse proxy & TLS

The compose file doesn't publish any ports. Something must terminate TLS and forward to the `app` service on port 3000. Pick one option.

**Caddy (bundled).** `docker-compose.override.example.yml` adds a Caddy container with automatic Let's Encrypt certificates. It runs `caddy reverse-proxy --from $DOMAIN --to app:3000` and needs ports 80 and 443 to be free. This is what the quick start uses.

**Your own Caddy** on the host: publish the app on localhost (the override's "Option B"), then add to your `Caddyfile`:

```caddy
mail.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx** on the host (with certificates from certbot). Publish the app on localhost as above. Disable buffering so realtime updates (Server-Sent Events) stream immediately:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name mail.example.com;

    ssl_certificate     /etc/letsencrypt/live/mail.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.example.com/privkey.pem;

    client_max_body_size 50m;              # attachments

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_buffering off;               # Server-Sent Events
        proxy_read_timeout 1h;
    }
}
```

**Traefik** (Docker provider). Add labels to the `app` service in `docker-compose.override.yml` and join Traefik's network:

```yaml
services:
  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.dispatch.rule=Host(`mail.example.com`)
      - traefik.http.routers.dispatch.entrypoints=websecure
      - traefik.http.routers.dispatch.tls.certresolver=letsencrypt
      - traefik.http.services.dispatch.loadbalancer.server.port=3000
    networks: [default, traefik]

networks:
  traefik:
    external: true
```

Whatever proxy you use:

- Keep `DOMAIN` equal to the public hostname. Sign-in links, OAuth redirect URIs and webhooks are built from it.
- Don't buffer responses on `/api/w/*/events`.
- Allow request bodies of at least your attachment size limit (default 25 MB).

## Where data and secrets live

| Volume | Mounted at | Contents |
| --- | --- | --- |
| `dispatch-db` | `db:/var/lib/postgresql/data` | PostgreSQL data |
| `dispatch-data` | `app,worker:/data` | `secrets/master.key` (encryption key, generated on first boot) and `storage/` (attachments, when using local storage) |
| `dispatch-secrets` | `db:/secrets`, `app,worker:/secrets` (read-only) | `db_password`, generated by the `db` container on first boot |

- **Database password.** The `db` container writes a random password to `/secrets/db_password` on first boot and applies it to the database role on every start. That file is the single source of truth: delete it and restart `db`, `app` and `worker` to rotate the password.
- **Master key.** `/data/secrets/master.key` encrypts mailbox passwords, OAuth tokens and all secrets stored in settings. **Back it up**, because a database backup can't be decrypted without it. See [Backup & restore](backup.md).
- **Settings** live in the database (`instance_settings`), not in files.

The app and worker run as uid `1001`. If you replace a named volume with a bind mount, `chown -R 1001:1001` the host directory first.

## Operations

**Logs**

```bash
docker compose logs -f app          # web requests, migrations, emails in log mode
docker compose logs -f worker       # mailbox sync, sending, rules, webhooks
docker compose logs --tail 200 db
```

Docker keeps container logs forever by default. Enable rotation in `/etc/docker/daemon.json`, then `systemctl restart docker`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

**Status and health.** `docker compose ps` shows the health of each container.

- The app is healthy when `GET /api/health` returns 200 (this includes a database check).
- The worker's status (last heartbeat, connected inboxes, last error) is shown in **Admin → System**.

Point your uptime monitor at `https://<DOMAIN>/api/health`.

**Updates:** `docker compose pull && docker compose up -d`. Migrations run automatically. Details and version pinning: [Upgrading](upgrading.md).

**Backups:** `pg_dump` plus the data volume. See [Backup & restore](backup.md).

**Shell / one-off commands**

```bash
docker compose exec db psql -U dispatch -d dispatch          # SQL shell
docker compose run --rm app migrate                          # run migrations only
docker compose exec app sh                                   # shell in the app container
```

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `app` stays *starting* / *unhealthy* | `docker compose logs app`. Usually the database isn't reachable yet (it retries for ~2 minutes) or `/data` isn't writable. |
| `dependency failed to start: container … is unhealthy` | The worker waits for a healthy app. Fix the app first, then run `docker compose up -d` again. |
| Caddy can't get a certificate | DNS must point to this server, and ports 80/443 must be open and not used by another web server. See `docker compose logs caddy`. |
| `/setup` rejects the setup code | Copy the most recent code from `docker compose logs app \| grep -A2 "setup code"`. Each start while setup is incomplete may print a new one. |
| Sign-in links point to `localhost` or the wrong host | `DOMAIN` is missing or wrong in `.env`. Fix it and `docker compose up -d`. |
| No emails arrive | Email is still in *log* mode: sign-in links are in `docker compose logs app`. Configure [email delivery](email-delivery.md). |
| Inbox won't connect | See [Connecting inboxes → Troubleshooting](connecting-inboxes.md#troubleshooting). Outbound ports 993/465/587 must be open. |
| Realtime updates only after refresh | A proxy is buffering Server-Sent Events. Disable buffering (`proxy_buffering off` in nginx). |
| `password authentication failed for user "dispatch"` | The secrets volume was recreated while the database was kept. Restart `db` first, which re-applies the password, then `app` and `worker`. |

Still stuck? Open a [discussion](https://github.com/codextde/dispatch/discussions) or a [bug report](https://github.com/codextde/dispatch/issues/new/choose) with the output of `docker compose ps` and the relevant logs (remove personal data).
