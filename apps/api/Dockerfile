# Production API image. Build stage installs the workspace, generates the
# Prisma client, then `pnpm deploy --prod` copies production dependencies only.
# The runtime runs that tree as the non-root `node` user. tsx stays a runtime
# dependency because the API and workspace packages are TypeScript source.

FROM node:22-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @s4n/api db:generate
RUN pnpm --filter @s4n/api deploy --legacy --prod /out
RUN rm -rf /out/generated && cp -a apps/api/generated /out/generated
RUN mkdir -p /out/plugins && cp -a plugins/. /out/plugins/
COPY apps/api/docker-entrypoint.sh /out/docker-entrypoint.sh

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV S4N_REPO_ROOT=/app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /out /app
# Named volume is first filled from this directory, so `node` can write alert sounds.
RUN mkdir -p /data/alert-sounds && chown node:node /data/alert-sounds
ENV S4N_ALERT_SOUND_DIR=/data/alert-sounds
USER node
EXPOSE 8787
CMD ["sh", "/app/docker-entrypoint.sh"]
