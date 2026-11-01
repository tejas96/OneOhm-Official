# Multi-stage build for the OneOhm API, worker, web app and the migrate/seed job.
#   docker build -f infrastructure/docker/Dockerfile --target api -t oneohm-api .
# Temporal's native worker needs glibc, so the base is Debian slim, not Alpine.
# Every image here is multi-arch: it builds on Oracle Cloud Ampere (arm64) and x86 alike.
ARG NODE_IMAGE=node:22.22.3-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --offline --frozen-lockfile
# Next.js bakes rewrites at build time: /api → the compose service "api".
# (Behind Caddy, /api never reaches Next; this matters only without the proxy.)
ARG API_INTERNAL_URL=http://api:4200
RUN NEXT_OUTPUT=standalone API_INTERNAL_URL=${API_INTERNAL_URL} pnpm turbo run build \
      --filter=@oneohm/api... --filter=@oneohm/worker... --filter=@oneohm/web... \
 && pnpm --filter @oneohm/worker bundle
# Self-contained production folders with only runtime dependencies.
RUN pnpm deploy --filter=@oneohm/api --prod --legacy /out/api \
 && pnpm deploy --filter=@oneohm/worker --prod --legacy /out/worker \
 && pnpm deploy --filter=@oneohm/database --prod --legacy /out/migrate

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production TZ=Asia/Kolkata
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime AS api
# Chromium renders quotation and report PDFs; Noto covers ₹ and Devanagari names.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
USER node
COPY --from=build --chown=node:node /out/api ./
EXPOSE 4200
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime AS worker
USER node
COPY --from=build --chown=node:node /out/worker ./
CMD ["node", "--enable-source-maps", "dist/main.js"]

# Applies migrations, then the idempotent seed (roles, company profile, first Super Admin).
FROM runtime AS migrate
USER node
COPY --from=build --chown=node:node /out/migrate ./
CMD ["sh", "-c", "node dist/migrate.cli.js && node dist/seed/seed.cli.js"]

FROM runtime AS web
USER node
# Next.js standalone output (apps/web/next.config: output: 'standalone').
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
ENV PORT=3200 HOSTNAME=0.0.0.0
EXPOSE 3200
CMD ["node", "apps/web/server.js"]
