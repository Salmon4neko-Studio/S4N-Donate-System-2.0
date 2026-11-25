FROM node:22-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter s4n-donate-system-2.0-overlay build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk add --no-cache wget
COPY apps/overlay/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/apps/overlay/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
