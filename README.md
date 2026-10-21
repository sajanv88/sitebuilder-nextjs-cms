# Sitebuilder

An open-source, self-hosted, WordPress-style CMS. Editors build pages and posts under `/admin`, and the public site renders from Postgres. Working title; licensed GPL-2.0-or-later.

> **Status: phase 1 (Foundation).** You can set up a site, sign in, and see the admin screens. Writing content comes in the next phase. See [docs/design.md](docs/design.md) for what's planned.

## Quickstart

You need Docker with Compose.

```sh
cp .env.example .env
# Set AUTH_SECRET in .env to at least 32 random characters, for example:
#   openssl rand -base64 32
docker compose up --build
```

Then open <http://localhost:3000/setup> and create the first admin account. `/setup` works only while the site has no accounts; after that, sign in at <http://localhost:3000/admin>.

To create the first admin without a browser, for example from a provisioning script:

```sh
docker compose run --rm \
  -e ADMIN_NAME="Ada Admin" -e ADMIN_EMAIL=ada@example.com -e ADMIN_PASSWORD='a long password' \
  admin node packages/db/dist/create-admin.mjs
```

It refuses if an account already exists. Pass `--force` after the script name to add another admin anyway.

## Configuration

Everything is set with environment variables, read at startup. A missing or invalid value stops the server with a message that names it.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection URL. Compose sets it for its own database. |
| `AUTH_SECRET` | yes | At least 32 characters. Signs sessions; keep it secret and stable. |
| `SITE_URL` | yes | The public address, such as `https://example.com`. Sign-in only accepts requests from it. |
| `MEDIA_STORAGE` | yes | `local` (a Docker volume) or `s3` (any S3-compatible store, such as MinIO). |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | with `s3` | Where media is stored, and the public address files are served from. |
| `MEDIA_MAX_BYTES` | no | Largest upload, in bytes. Default 25 MiB. |
| `CRON_SECRET` | no | At least 32 characters. Protects the scheduled-publishing route (later phase). |

## How it's built

Two Next.js apps on one domain, as [Multi-Zones](https://nextjs.org/docs/app/guides/multi-zones):

- `apps/site`: the public site. It serves every path except the admin ones, which it forwards to the admin zone.
- `apps/admin`: `/admin`, `/setup` and the sign-in API under `/api/auth`.

They share `packages/db` (Drizzle ORM, migrations and queries) and `packages/schema` (valibot schemas for content, settings and configuration). In Compose only `site` is published; `admin` is reachable from it as `http://admin:3000`. Choices that differ from the design are recorded in [docs/decisions.md](docs/decisions.md).

## Development

Requires Node 26 (see `.node-version`) and pnpm, which switches itself to the version in `package.json`.

```sh
pnpm install
cp .env.example .env            # and set AUTH_SECRET
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres
pnpm db:migrate
pnpm dev                        # site on http://localhost:3000, admin on :3001 behind it
```

Always browse through port 3000: the site zone forwards the admin paths, as it does in production.

| Command | Does |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | The checks CI runs |
| `pnpm db:generate` | A new migration from schema changes (read the SQL, commit it) |
| `pnpm db:migrate` | Apply migrations to the database in `.env` |
| `pnpm --filter @sitebuilder/db db:auth-schema` | Regenerate Better Auth's tables after changing its plugins |

## Backups

Back up the Postgres database (`pg_dump`) and, with `MEDIA_STORAGE=local`, the `media` volume. A full guide comes with the 0.1 release.

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE) and, for dependencies, [docs/licences.md](docs/licences.md).
