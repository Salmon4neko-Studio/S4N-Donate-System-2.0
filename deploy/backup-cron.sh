#!/bin/sh
# 不想跑 backup 服務時，用主機的 cron 呼叫這支。它在 postgres 容器裡 dump，寫到儲存庫旁的 backups/。
# 例：15 4 * * * /opt/s4n/deploy/backup-cron.sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

if [ ! -f .env ]; then
  echo ".env is required" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
. ./.env
set +a

: "${S4N_BACKUP_RETENTION:?S4N_BACKUP_RETENTION is required}"
case "$S4N_BACKUP_RETENTION" in
  *[!0-9]*)
    echo "S4N_BACKUP_RETENTION must be a positive integer" >&2
    exit 1
    ;;
esac

mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/s4n-${stamp}.dump"
docker compose -f compose.prod.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$target"

ls -1t backups/s4n-*.dump | awk -v keep="$S4N_BACKUP_RETENTION" 'NR > keep' | while read -r old; do
  rm -f "$old"
done
echo "backup ok ${target}"
