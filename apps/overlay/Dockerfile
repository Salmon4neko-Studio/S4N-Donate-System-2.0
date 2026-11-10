FROM node:22-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @s4n/overlay build

FROM nginx:1.27-alpine
COPY apps/overlay/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/overlay/dist /usr/share/nginx/html
