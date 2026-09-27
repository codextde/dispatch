# Upgrading

Dispatch follows [semantic versioning](https://semver.org). Minor and patch releases can be applied directly. Major releases may need manual steps, which are listed below and in the [release notes](https://github.com/codextde/dispatch/releases).

Database migrations run automatically when the new version starts. They're idempotent and guarded by a Postgres advisory lock, so the app and worker never run them twice.

## Before you upgrade

1. Read the release notes for every version between yours and the target.
2. [Take a backup](backup.md) of the database and the data directory.
3. Check the running version: `curl -s https://<your-domain>/api/health`.

## Docker Compose

```bash
cd /opt/dispatch               # the directory with docker-compose.yml
docker compose pull            # fetch the new images
docker compose up -d           # recreate app + worker; migrations run on start
docker compose logs -f app     # watch the migration and startup
```

To stay on a specific release, pin it in `.env` and change it when you upgrade:

```bash
# .env
DOMAIN=mail.example.com
DISPATCH_VERSION=1.0.0
```

Image tags:

| Tag | Meaning |
| --- | --- |
| `latest` | Latest stable release |
| `1`, `1.0`, `1.0.0` | Latest release within a major / minor line, or an exact release |
| `main` | Latest commit on `main`. Unreleased, for testing only |
| `sha-<commit>` | A specific commit |

Also refresh `docker-compose.yml` from the repository when a release note says so:

```bash
curl -fsSLO https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.yml
```

## Coolify

Change `DISPATCH_VERSION` and redeploy. See [Coolify → Updating](coolify.md#updating).

## Rolling back

Migrations only move forward. To roll back to an older version after a release that changed the database schema, restore the backup you took before upgrading, then start the older image tag.

## PostgreSQL major versions

The bundled database is `postgres:17-alpine`. Postgres can't open a data directory from another major version. Don't change the image tag to `postgres:18` on an existing installation. Upgrade with a dump and restore instead:

1. `pg_dump` the database ([Backup](backup.md#back-up-the-database)).
2. `docker compose down`, then remove the `dispatch-db` volume (`docker volume rm <project>_dispatch-db`).
3. Change the `db` image, `docker compose up -d db`, and [restore](backup.md#restore) the dump.

## Version notes

### 1.0.0

Initial release. Nothing to migrate.
