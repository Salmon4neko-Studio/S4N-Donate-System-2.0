#!/bin/sh
set -eu
cd /app/apps/api

ok=0
i=1
while [ "$i" -le 10 ]; do
  if pnpm exec prisma migrate deploy; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "prisma migrate deploy failed" >&2
  exit 1
fi

exec pnpm exec tsx src/index.ts
