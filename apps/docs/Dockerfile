# syntax=docker/dockerfile:1
#
# Next.js standalone image for apps/docs in a pnpm + Turborepo monorepo. The documentation reads
# no database and no secrets: it needs no environment to start.
# Build from the repo root:  docker build -f apps/docs/Dockerfile -t docs .
# Run:                       docker run --rm -p 3000:3000 docs

# Node: exact version (matches .node-version) pinned by multi-arch index digest.
ARG NODE_IMAGE=node:26.12.1-alpine3.24@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797

# ---- base: Node + pnpm (standalone binary, checksum-verified; no npm, no Corepack) ----
FROM ${NODE_IMAGE} AS base
# Keep PNPM_VERSION equal to "packageManager" in package.json. The checksums are the
# GitHub release assets pnpm-linux-{x64,arm64}-musl.tar.gz for that version.
ARG PNPM_VERSION=12.14.0
ARG PNPM_SHA256_AMD64=d7115e2f2791d79bf9e7e448609537595bb7787de1ef5292ce91ff3d1be2629e
ARG PNPM_SHA256_ARM64=511a54809bdfd28270d30011d1697f582c8130d555b4fa0e2856b1a7534c98bf
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x64; sha="${PNPM_SHA256_AMD64}" ;; \
      arm64) arch=arm64; sha="${PNPM_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    wget -qO /tmp/pnpm.tar.gz "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-${arch}-musl.tar.gz"; \
    echo "${sha}  /tmp/pnpm.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/pnpm; \
    tar -xzf /tmp/pnpm.tar.gz -C /opt/pnpm; \
    rm /tmp/pnpm.tar.gz; \
    ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm; \
    pnpm --version
ENV pnpm_config_store_dir=/pnpm/store \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo

# ---- pruner: a copy of the monorepo with only docs and what it depends on ----
FROM base AS pruner
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm dlx "turbo@$(node -p 'require("./package.json").devDependencies.turbo')" prune docs --docker

# ---- deps: install from the lockfile; this layer is reused until a manifest changes ----
FROM base AS deps
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch && pnpm install --frozen-lockfile --offline

# ---- builder: the pages, their MDX and screenshots are compiled in here ----
FROM deps AS builder
COPY --from=pruner /repo/out/full/ .
# Only NEXT_PUBLIC_* values and the deployment id are build arguments: they're inlined at
# build time. The docs have no NEXT_PUBLIC_* values.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID} \
    NODE_ENV=production
RUN pnpm exec turbo run build --filter=docs

# ---- runner: standalone output only, non-root ----
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs -H -s /sbin/nologin nextjs
# Files stay owned by root and read-only to the app. Only .next/cache is writable (the image
# optimiser's cache); in Kubernetes it's an emptyDir so the root filesystem can be read-only.
# The docs have no public/ folder: their pictures are imported, so they're in .next/static.
COPY --from=builder /repo/apps/docs/.next/standalone ./
COPY --from=builder /repo/apps/docs/.next/static ./apps/docs/.next/static
# GPL-2.0-or-later: the licence and every dependency's licence travel with the image.
COPY LICENSE THIRD_PARTY_LICENSES.md ./
RUN mkdir -p apps/docs/.next/cache && chown 1001:1001 apps/docs/.next/cache
LABEL org.opencontainers.image.title="sitebuilder-docs" \
      org.opencontainers.image.licenses="GPL-2.0-or-later"
USER 1001:1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/docs/server.js"]
