# Sitebuilder

An open-source, self-hosted, WordPress-style CMS. Editors build pages and posts from blocks under `/admin`; the public site renders from Postgres with caching, so publishing needs no rebuild or deploy. Working title; licensed GPL-2.0-or-later.

What's in 0.1:
- Pages and posts built from 21 blocks, with drafts, scheduling, revisions and autosave.
- Categories and tags, two menus and a media library.
- Themes made from presets plus your own colors, and users in three roles (admin, editor, author).
- On the public site: SEO tags, a sitemap, an RSS feed, redirects when an address changes, and draft preview.

## Quickstart (Docker Compose)

You need Git and Docker with Compose v2.

```sh
git clone https://github.com/sajanv88/sitebuilder-nextjs-cms.git sitebuilder
cd sitebuilder
cp .env.example .env
```

Open `.env` and set `AUTH_SECRET` to at least 32 random characters. To make one:

```sh
openssl rand -base64 32                                                        # macOS, Linux, Git Bash
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))   # PowerShell
```

Then start everything (the first build takes a few minutes):

```sh
docker compose up --build
```

Open <http://localhost:3000/setup> and create the first admin account. `/setup` works only while the site has no accounts; after that, sign in at <http://localhost:3000/admin>.

From there:
- **Settings:** name the site.
- **Pages → New page:** build a page from blocks and publish it. It's live at its address straight away.
- **Settings → Reading:** choose the home page.
- **Menus:** build the header and footer menus.

To create the first admin without a browser, for example from a provisioning script:

```sh
docker compose run --rm \
  -e ADMIN_NAME="Ada Admin" -e ADMIN_EMAIL=ada@example.com -e ADMIN_PASSWORD='a long password' \
  admin node packages/db/dist/create-admin.mjs
```

It refuses if an account already exists. Pass `--force` after the script name to add another admin anyway.

### On a server

Compose publishes the site on port 3000 over plain HTTP. On a server, put a reverse proxy with TLS in front of it (Caddy, nginx, Traefik), and set:
- `SITE_URL` to the public `https://` address. Sign-in only accepts requests from it.
- `CLIENT_IP_HEADER` to the header your proxy overwrites with the visitor's address, usually `x-forwarded-for` for Caddy and Traefik. Sign-in attempts are then also limited per address; without it, they're limited per account only.

The proxy must replace a header the visitor sent, not append to it. Next.js keeps whatever the visitor sends, so without such a proxy the header can't be trusted. With nginx, `$proxy_add_x_forwarded_for` appends, so set `proxy_set_header X-Real-IP $remote_addr;` and use `CLIENT_IP_HEADER=x-real-ip`.

## Configuration

Everything is set with environment variables, read at startup. A missing or invalid value stops the server with a message that names it; values are never printed.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection URL. Compose sets it for its own database. |
| `AUTH_SECRET` | yes | At least 32 characters. Signs sessions and encrypts the S3 key saved in Settings; keep it secret and don't change it. |
| `SITE_URL` | yes | The public address, such as `https://example.com`. |
| `MEDIA_STORAGE` | yes | Where uploads go until an admin chooses in Settings → Media storage: `local` or `s3`. |
| `MEDIA_LOCAL_DIR` | no | Local storage's folder. Default `/data/media`, the Compose volume. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with `s3` | Any S3-compatible store: AWS S3, MinIO, Cloudflare R2. |
| `MEDIA_MAX_BYTES` | no | Largest upload, in bytes. Default 25 MiB. |
| `CRON_SECRET` | no | At least 32 characters. Turns on `/api/cron/publish` for an outside cron service (see [Scheduled posts](#scheduled-posts)). |
| `CLIENT_IP_HEADER` | no | The header with the visitor's address, for the per-address sign-in limit (see [On a server](#on-a-server)). |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, … | no | OpenTelemetry traces and metrics, with the standard variables. |

## Media storage

Uploads (images, video, PDF; up to `MEDIA_MAX_BYTES`) go either to a folder on disk or to an S3-compatible bucket. Every file is served from the site at `/media/<key>`, whichever storage holds it.

- **Compose:** `local` storage is a Docker volume, `media`, written by the admin and read by the site.
- **Kubernetes and Vercel:** use S3. Pods and functions don't keep files.
- **Settings → Media storage:** an admin can switch to a bucket from the admin itself, with keys entered there. They're stored encrypted with `AUTH_SECRET`, and they win over the environment. Files already uploaded stay where they are and keep working.

## Scheduled posts

Publish with a date in the future and the entry is **scheduled**. The admin checks once a minute, in every admin process, and publishes what's due; the site shows it on the next request. With Compose and Kubernetes there's nothing to set up.

Where the admin doesn't keep running, call the cron route once a minute instead. That's Vercel, or any setup where you'd rather use system cron. Set `CRON_SECRET`, then:

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://example.com/api/cron/publish
```

Without `CRON_SECRET` the route doesn't exist.

## Templates

A template decides how the public site looks: its header and footer, how pages and posts are laid out, its styles, and sometimes blocks of its own. It can also bring a theme, starter pages and menus. Four come with Sitebuilder. An admin picks one, and sets its options, under **Templates** in the admin. Nothing anyone has written is changed or removed.

Templates are installed when the images are built, never in a running site. To add one from a folder:

```sh
pnpm sitebuilder template add path/to/my-template    # checks a copy, then installs it
pnpm build                                           # or: docker compose up --build -d
```

`add` refuses a template that breaks a rule, naming the file and the rule. It records the template in `templates/templates.lock.json` as **local**, which means not reviewed. A production build refuses a local template unless it's built with `ALLOW_UNREVIEWED_TEMPLATES=true` (a build argument of both Dockerfiles). `template remove <slug>` uninstalls one. A site that was using it falls back to the default template. `template verify` checks every installed template, and `template list` lists them.

To write a template, start from a copy of `templates/ledger` under a new name. It has its own layouts, a stylesheet, options, a block and starter pages. `pnpm sitebuilder template verify <folder>` runs the same checks as `add`. A template's code gets only plain values (`packages/template-sdk`), and may import only React, nuvui, `next/link`, `next/image` and its own files.

## Upgrading

Your content lives in Postgres and the media storage; the images hold no state.

```sh
git pull
docker compose up --build -d
```

The `migrate` service applies new database migrations before the site and admin start. It's safe to run any number of times. In Kubernetes, the chart's migrate Job does the same on every sync.

## Backups and restore

Back up the database and the uploaded files together. The commands are for a POSIX shell (Linux, macOS). In Git Bash on Windows, run `export MSYS_NO_PATHCONV=1` first, or it rewrites `/backup` into a Windows path; PowerShell's `>` and `<` don't pass binary files through unchanged.

```sh
# Database (custom format, compressed)
docker compose exec -T postgres pg_dump -U app -d sitebuilder -Fc > sitebuilder.dump

# Uploads, with local storage: the media volume
docker compose run --rm --no-deps -v "$PWD":/backup --entrypoint tar admin \
  -czf /backup/media.tar.gz -C /data/media .
```

With S3 storage, back up the bucket with your provider's tools instead.

To restore into a fresh install:
1. Start only Postgres: `docker compose up -d postgres`.
2. Restore the database.
3. Unpack the media into the volume.
4. Start the rest.

```sh
docker compose exec -T postgres pg_restore -U app -d sitebuilder --clean --if-exists < sitebuilder.dump
docker compose run --rm --no-deps -u 0 -v "$PWD":/backup --entrypoint tar admin \
  -xzf /backup/media.tar.gz -C /data/media
docker compose up -d
```

`AUTH_SECRET` must be the same as when the backup was made, or everyone signs in again and an S3 key saved in Settings has to be entered again.

## Kubernetes

The Helm chart runs both zones (the site and the admin), a migrate Job, and an optional ingress:

```sh
helm install sitebuilder oci://ghcr.io/sajanv88/charts/sitebuilder --version 0.1.0 \
  -n sitebuilder --create-namespace -f my-values.yaml
```

Before the first install, create two Secrets in the namespace. The chart only references them by name:
- **`sitebuilder-db`:** `DATABASE_URL`.
- **The `existingSecret`:** `AUTH_SECRET`, plus `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, and optionally `CRON_SECRET`.

```sh
kubectl -n sitebuilder create secret generic sitebuilder-db --from-literal=DATABASE_URL='postgres://…'
kubectl -n sitebuilder create secret generic sitebuilder-secrets \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=S3_ACCESS_KEY_ID=… --from-literal=S3_SECRET_ACCESS_KEY=…
```

A minimal `my-values.yaml`:

```yaml
existingSecret: sitebuilder-secrets
config:
  SITE_URL: https://cms.example.com
  MEDIA_STORAGE: s3
  S3_ENDPOINT: https://s3.eu-west-1.amazonaws.com
  S3_BUCKET: my-site-media
  S3_REGION: eu-west-1
ingress:
  enabled: true
  className: nginx
  host: cms.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - secretName: sitebuilder-tls
      hosts: [cms.example.com]
```

Then open `https://cms.example.com/setup`.

Every value is described in [`charts/sitebuilder/values.yaml`](charts/sitebuilder/values.yaml). A few to know before installing:

- **One release per namespace.** The admin's Service is always named `admin`, because the site image forwards the admin paths to `http://admin:3000`.
- **The ingress sends `/admin`, `/admin-static`, `/setup` and `/api/auth` to the admin** and everything else to the site. `CLIENT_IP_HEADER` defaults to `x-real-ip`, which ingress-nginx and Traefik set. Behind a cloud load balancer, make sure the ingress sees the client's address (for example `externalTrafficPolicy: Local` or the PROXY protocol).
- **Migrations** run as an Argo CD PreSync Job, from the admin image. Plain `helm install` and `helm upgrade` run the Job alongside the new pods, so pages that read the database fail for the few seconds until it's done.
- **Database connections:** each pod opens up to 12 (a pool of 10, plus 2 for the cache). Size Postgres or PgBouncer for (site replicas + admin replicas) × 12.
- **Local storage** needs a ReadWriteMany claim (`media.local.existingClaim`): the admin writes, the site reads.
- **Images are private on GHCR** until made public: add a pull Secret to `imagePullSecrets`.

With Argo CD, point an Application at the OCI chart, or at `charts/sitebuilder` in this repository with `image.tag: sha-<short-sha>`.

## Vercel

> **Not tested for 0.1.** The steps below follow how the app is built; check them on a staging project first. In particular, the site's cache invalidation relies on the bundled cache handler (`packages/db/dist/cache-handler.mjs`) being loaded on Vercel's functions. If it isn't, a published change shows only once Vercel's own cache expires.

1. **Storage and database:** media must use S3 (`MEDIA_STORAGE=s3`), and `DATABASE_URL` must go through a connection pooler, because every function instance opens its own connections.
2. **The admin project:** create a project with root directory `apps/admin`. Set `DATABASE_URL`, `AUTH_SECRET`, `SITE_URL` (the site's public address) and the S3 variables.
3. **The site project:** create a project with root directory `apps/site`. Set the same variables, plus `ADMIN_ZONE_URL` at **build** time: the admin project's address, such as `https://sitebuilder-admin.vercel.app`. The site forwards the admin paths there.
4. **Domain:** point your domain at the site project only.
5. **Scheduled posts:** set `CRON_SECRET` on the site project and add `apps/site/vercel.json`:

   ```json
   { "crons": [{ "path": "/api/cron/publish", "schedule": "* * * * *" }] }
   ```

   Vercel sends the secret as `Authorization: Bearer …` itself. Plans that allow only a daily cron publish scheduled posts once a day.

## Development

Requires Node 26 (see `.node-version`) and pnpm, which switches itself to the version in `package.json`.

```sh
pnpm install
cp .env.example .env            # set AUTH_SECRET, and MEDIA_LOCAL_DIR to an absolute path such as this repo's .media/
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres
pnpm db:migrate
pnpm dev                        # site on http://localhost:3000, admin on :3001 behind it
```

Always browse through port 3000: the site zone forwards the admin paths, as it does in production.

| Command | Does |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | The checks CI runs |
| `pnpm licence-list` | Rewrites `THIRD_PARTY_LICENSES.md`; `--check` fails on an unreviewed licence |
| `pnpm db:generate` | A new migration from schema changes (read the SQL, commit it) |
| `pnpm db:migrate` | Apply migrations to the database in `.env` |
| `pnpm db:seed` | Idempotent local sample data |
| `helm lint --strict charts/sitebuilder` | Check the chart |

### How it's built

Two Next.js apps on one domain, as [Multi-Zones](https://nextjs.org/docs/app/guides/multi-zones):
- `apps/site` is the public site. It serves every path except the admin ones, which it forwards.
- `apps/admin` serves `/admin`, `/setup` and the sign-in API under `/api/auth`.

They share these packages:

| Package | What's in it |
|---|---|
| `packages/db` | Drizzle ORM, migrations, queries and the cache handler |
| `packages/schema` | valibot schemas |
| `packages/blocks` | The block registry and renderer |
| `packages/media` | Media storage |
| `packages/auth` | Better Auth and the permission checks |
| `packages/template-sdk` | What a template's code receives |
| `packages/template-checks` | The rules a template must pass |
| `packages/cli` | The `sitebuilder` command: `generate` and `template …` |
| `templates` | The installed templates, their lockfile, and what `generate` writes for the apps |

The editor shows a page in an iframe of the site zone (`/_canvas/<id>`), drawn by the active template. Its blocks are drawn in the browser from what the editor sends as you type.

An admin change reaches every site process through a small table of cache tags in Postgres, so no rebuild is needed.

### Releasing

1. Merge to `main`. `main.yaml` builds both images (amd64 and arm64) and pushes them as `ghcr.io/<owner>/sitebuilder-site:sha-<short-sha>` and `…-admin:sha-<short-sha>`.
2. Wait for it to go green.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`. `release.yaml` retags those images as `vX.Y.Z` and `latest` without rebuilding, pushes the chart to `oci://ghcr.io/<owner>/charts/sitebuilder` at `X.Y.Z`, and creates the GitHub Release.

Never edit `version` or `appVersion` in `Chart.yaml`; the release sets them.

## Licence

Copyright (C) 2026 Sajankumar Vijayan

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with this program; if not, see <https://www.gnu.org/licenses/>.
