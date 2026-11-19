#!/bin/sh
# 從一份 custom-format dump 還原。會先停 API，還原後再啟動。
# 用法：deploy/restore.sh backups/s4n-20261119T040000Z.dump
set -eu

file=${1:?用法：deploy/restore.sh backups/s4n-時間.dump}
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

if [ ! -f "$file" ]; then
  echo "找不到 ${file}" >&2
  exit 1
fi

docker compose -f compose.prod.yaml stop api
docker compose -f compose.prod.yaml exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
docker compose -f compose.prod.yaml start api
echo "restore finished ${file}"
