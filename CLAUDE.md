# Sitebuilder

A self-hosted, WordPress-style CMS: two Next.js 16 apps as Multi-Zones (`apps/site` public, `apps/admin` for `/admin`, `/setup`, `/api/auth`) in a pnpm + Turborepo monorepo, built on nuvui, shipped as Docker images. Product design: `docs/design.md`. Deviations from it or from a skill: `docs/decisions.md`. Work for later phases: `docs/next.md`. Conventions come from the `nuvraxis-frontend` and `nuvraxis-fullstack` plugins; their skills have the full rules.

- **Zones.** The site zone forwards the admin paths with `beforeFiles` rewrites to the build-time `ADMIN_ZONE_URL`. Links between zones are `<a>`, never `<Link>`. Browse through the site zone (port 3000) in development too.
- **Permissions.** Every admin page, Server Action and route handler checks `can()` (`apps/admin/src/auth/`); the table is `permissions.ts`. Hiding a link is never the check.
- **Commits.** Don't commit unless asked.

## Ground rules

- **Licence notice on every new source file.** Every `.ts`, `.tsx`, `.mts`, `.js`, `.mjs`, `.scss` file you create starts with these two lines (after a shebang, if any), then a blank line; `.css` uses the `/* … */` form. A `"use client"` or `"use server"` directive goes after them, unchanged. Generated files (`auth-schema.ts`, migrations, `next-env.d.ts`) are left alone. `pnpm check:licence` checks it, in CI too.

  ```ts
  // SPDX-License-Identifier: GPL-2.0-or-later
  // Copyright (C) 2026 Sajankumar Vijayan
  ```
- **pnpm only.** Never write `npm`, `npx` or `yarn` in a file, script or command. Use `pnpm`, `pnpm dlx`, `pnpm exec`. Add dependencies to the workspace `catalog:` in `pnpm-workspace.yaml` and reference them as `"catalog:"`.
- **Node 26**, the exact version in `.node-version`. The Dockerfile base and CI use the same version.
- **Biome formats and lints** everything except SCSS. Don't add ESLint or Prettier. A plugin hook runs `biome check --write` on each file Claude edits.
- **SCSS is BEM + nuvui tokens, linted by stylelint.** One block per file beside its component, global (not `.module.scss`), `@use` never `@import`, every color a token, no `!important`, never select a `nuv-` class.
- **This app uses nuvui. Read it before writing any UI** (see below). Every control comes from a nuvui package, never a browser control (`<input type="date">` and the like). Change a component's look by prop → `--nuv-*` variable → token. Blocks: `pnpm dlx shadcn@latest add https://nuvui.nuvraxis.com/r/<name>.json`.
- **Server Components by default.** `"use client"` only on the leaf that needs state, effects or handlers.
- **Every Server Action and route handler** authenticates, validates input with valibot, and authorises against the resource itself.
- **Config:** `NEXT_PUBLIC_*` is baked in at build and identical in every environment. Everything per-environment is a runtime env var read on the server through `src/env.ts`.

## Before writing any UI: read nuvui first

Never write nuvui code from memory. Before the first line of a page, component or stylesheet, read the library through the nuvui MCP, passing the `@nuvui/react` version from `apps/admin/package.json` or `apps/site/package.json` as `version`:

1. `get_rules`, then `get_rules` with each topic the work touches.
2. `get_changes` with the installed `@nuvui/*` versions.
3. `list_components` across every package, add-ons included.
4. `list_blocks`, and `list_charts` for any chart; `get_block` / `get_chart` for one that fits, and start from it.
5. `list_guides`, and `get_page` for each guide that applies.
6. `get_page` for every component you'll use, the whole page; `search_docs` for anything you can't place.
7. `get_tokens` before writing any CSS value.

If the MCP isn't connected, read the same from the `nuvraxis-frontend:nuvui` skill and say so.

## Commands

```sh
pnpm dev            # turbo run dev
pnpm typecheck      # next typegen && tsc --noEmit, per package
pnpm lint           # biome check . && stylelint "**/*.scss"
pnpm lint:fix
pnpm build          # turbo run build
docker compose up --build                        # the whole stack, from the repo root
docker build -f apps/admin/Dockerfile -t admin .   # one image
helm lint --strict charts/site
```

Run `pnpm typecheck && pnpm lint && pnpm build` before calling a change done.

## Layout

```
apps/site/               main zone: the public site; Dockerfile beside it
apps/admin/              admin zone: /admin, /setup, /api/auth, Better Auth, can(); Dockerfile beside it
packages/schema/         valibot schemas: blocks, menus, settings, accounts, env (valibot only)
packages/db/             Drizzle schema, migrations, queries, bundled migrate/seed/create-admin
packages/tsconfig/       shared tsconfig (base.json)
charts/site/             Helm chart (still single-zone; reworked in phase 5)
compose.yaml             postgres, migrate, admin, site; compose.dev.yaml publishes Postgres for pnpm dev
.github/workflows/       pr.yaml, main.yaml, release.yaml (images built per zone)
```

## Delivery

PR → `pr.yaml` checks (Biome, stylelint, typecheck, build, Docker build + health check, helm lint + kubeconform). Nothing is published.
Merge to `main` → `main.yaml` builds the image once (amd64 + arm64) and pushes `ghcr.io/nuvraxis/site:sha-<short-sha>` and `:main`.
Tag `vX.Y.Z` → `release.yaml` retags that commit's image as `:vX.Y.Z` and `:latest` (no rebuild), pushes the chart to `oci://ghcr.io/nuvraxis/charts/site` at `X.Y.Z`, and creates the GitHub Release.
Argo CD syncs the chart from the OCI registry (production) or from `charts/site` in git.

Release ritual: merge to main → wait for `main.yaml` to go green → `git tag vX.Y.Z && git push origin vX.Y.Z`. Never edit `version`/`appVersion` in `Chart.yaml`; the release sets them.

## Which skill applies

| Working on | Skill |
|---|---|
| `.ts`/`.tsx` types, tsconfig, validation | `nuvraxis-frontend:typescript-production` |
| Pages, data, caching, actions, env | `nuvraxis-frontend:nextjs-production` |
| Auth, cookies, CSP, headers, redirects | `nuvraxis-frontend:nextjs-security` |
| `biome.json`, lint/format errors | `nuvraxis-frontend:biome` |
| `.scss` | `nuvraxis-frontend:scss-bem` |
| Workspace, catalog, `turbo.json` | `nuvraxis-frontend:pnpm-turborepo` (engine details: `turborepo`) |
| `Dockerfile`, `.dockerignore` | `nuvraxis-frontend:docker-nextjs` |
| `charts/` | `nuvraxis-frontend:helm-nextjs` |
| `.github/workflows/` | `nuvraxis-frontend:github-actions` |
| nuvui components, theming, blocks | `nuvraxis-frontend:nuvui` |

## Database (nuvraxis-fullstack)

PostgreSQL through Drizzle ORM v1, in `packages/db` (`@sitebuilder/db`). Rules: the `nuvraxis-fullstack` skills `drizzle-postgres`, `db-package` and `postgres-ops`; drizzle-kit itself: the vendored `drizzle-kit*` skills.

- `packages/db` is the only package that imports `drizzle-orm` or `pg`. Apps import `db`, types and query functions from `@sitebuilder/db`.
- Schema change: edit `packages/db/src/schema/`, then `pnpm db:generate`, read the SQL, commit it. Never edit a committed migration; add a new one. Never `drizzle-kit push` outside a throwaway local database.
- Validate input with the valibot schemas from `@sitebuilder/db` before any insert; never pass `FormData` to a query.
- Local database: `cp .env.example .env` (set AUTH_SECRET), `docker compose -f compose.yaml -f compose.dev.yaml up -d postgres`, `pnpm db:migrate`, `pnpm db:seed`.
- Never commit `.env` or any `DATABASE_URL` with real credentials. In Kubernetes it comes from an existing Secret, and the chart only references it by name.
- Migrations run as a separate step: compose's `migrate` service, and in Kubernetes an Argo CD PreSync Job, both running `node packages/db/dist/migrate.mjs` from the app image.
- The drizzle-kit MCP server is in `.mcp.json` but disabled in `.claude/settings.json`: it can `push` and `pull` against whatever `DATABASE_URL` is set. Enable it only while that points at a local database.

```sh
pnpm db:generate   # new migration from the schema diff
pnpm db:check      # migration conflicts across branches
pnpm db:migrate    # build + apply with the bundled runner
pnpm db:seed       # idempotent local data
pnpm db:studio     # local inspection only
```
