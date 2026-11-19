#!/bin/sh
set -eu

cd /app

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

ok=0
i=1
while [ "$i" -le 15 ]; do
  if ./node_modules/.bin/prisma migrate deploy; then
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

exec ./node_modules/.bin/tsx src/index.ts
