#!/bin/sh
# 每天 pg_dump 一次，只保留最近 S4N_BACKUP_RETENTION 份。給 compose.prod.yaml 的 backup 服務用。
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${S4N_BACKUP_RETENTION:?S4N_BACKUP_RETENTION is required}"

case "$S4N_BACKUP_RETENTION" in
  *[!0-9]*)
    echo "S4N_BACKUP_RETENTION must be a positive integer" >&2
    exit 1
    ;;
esac
if [ "$S4N_BACKUP_RETENTION" -lt 1 ]; then
  echo "S4N_BACKUP_RETENTION must be a positive integer" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"
mkdir -p /backups

prune() {
  ls -1t /backups/s4n-*.dump | awk -v keep="$S4N_BACKUP_RETENTION" 'NR > keep' | while read -r old; do
    rm -f "$old"
  done
}

while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/s4n-${stamp}.dump"
  echo "backup start ${target}"
  if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$target"; then
    prune
    touch /backups/.last-ok
    echo "backup ok ${target}"
    sleep 86400
  else
    rm -f "$target"
    echo "backup failed; retry in 300s" >&2
    sleep 300
  fi
done
