# Backup & restore

A Dispatch instance keeps its state in two places. Back up both, together:

| What | Where (Docker Compose) | Why it matters |
| --- | --- | --- |
| **Database** | volume `dispatch-db` (service `db`) | Everything: users, workspaces, conversations, messages, settings, encrypted credentials |
| **Data directory** | volume `dispatch-data`, mounted at `/data` | `/data/secrets/master.key` (the encryption key) and `/data/storage` (attachments, when using local storage) |

> **The database backup is useless without the master key.** Mailbox passwords, OAuth tokens, SMTP/Stripe/AI keys and webhook secrets are encrypted with a key derived from `/data/secrets/master.key` (or `DISPATCH_SECRET` if you set it). Store the key somewhere safe and separate from the dump, e.g. in your password manager.

The generated database password in the `dispatch-secrets` volume does not need to be backed up. A new one is generated and applied automatically if it's missing.

Commands below are run from the directory containing `docker-compose.yml`.

## Back up the database

`pg_dump` in custom format is compact and can restore selectively:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U dispatch -d dispatch -Fc > "backups/dispatch-$(date +%F).dump"
```

This is safe while Dispatch is running: `pg_dump` takes a consistent snapshot.

## Back up the data directory

```bash
docker compose run --rm -T --no-deps --entrypoint tar app -C /data -czf - . > "backups/dispatch-data-$(date +%F).tar.gz"
```

If you store attachments in S3 (Admin → Settings → Storage), `/data` only holds the master key. Back the bucket up with your provider's tooling, e.g. versioning plus lifecycle rules.

## Automate it

A minimal nightly job with 14 days retention, e.g. `/etc/cron.d/dispatch-backup` (adjust the path):

```cron
30 3 * * * root cd /opt/dispatch && docker compose exec -T db pg_dump -U dispatch -d dispatch -Fc > backups/dispatch-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

Copy `backups/` off the server, e.g. with `restic`, `rclone` or your provider's snapshots. A backup on the same disk is not a backup.

On **Coolify**, use scheduled database backups or a Scheduled Task instead. See [Coolify → Backups](coolify.md#backups).

## Restore

On a fresh server (or after `docker compose down -v`):

```bash
# 1. Start only the database (creates a new, empty database)
docker compose up -d db

# 2. Restore the data directory (master key + local attachments)
docker compose run --rm -T --no-deps --entrypoint tar app -C /data -xzf - < backups/dispatch-data-2026-09-27.tar.gz

# 3. Restore the database
docker compose exec -T db pg_restore -U dispatch -d dispatch --clean --if-exists --no-owner < backups/dispatch-2026-09-27.dump

# 4. Start everything
docker compose up -d
```

Then open `/api/health` and sign in. If mailboxes show authentication errors after a restore, the master key doesn't match the one used when the dump was taken.

## Moving to another server

1. Take both backups on the old server and stop it (`docker compose down`) so no mail is synced twice.
2. Copy `docker-compose.yml`, `.env` (and `docker-compose.override.yml` if you use one) and the backups to the new server.
3. Restore as above and point DNS to the new server.
