#!/bin/sh
# 由 compose.prod.yaml 的環境變數寫出 Caddyfile。網域只接受主機名，避免把指令寫進設定。
set -eu

host_ok() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
}

: "${S4N_DOMAIN:?S4N_DOMAIN is required}"
: "${S4N_OVERLAY_HOST:?S4N_OVERLAY_HOST is required}"
: "${S4N_TLS_MODE:?S4N_TLS_MODE is required}"
: "${S4N_ACME_EMAIL:?S4N_ACME_EMAIL is required}"

host_ok "$S4N_DOMAIN" || {
  echo "S4N_DOMAIN is invalid" >&2
  exit 1
}
host_ok "$S4N_OVERLAY_HOST" || {
  echo "S4N_OVERLAY_HOST is invalid" >&2
  exit 1
}
if [ "$S4N_DOMAIN" = "$S4N_OVERLAY_HOST" ]; then
  echo "S4N_OVERLAY_HOST must be a different hostname" >&2
  exit 1
fi

case "$S4N_TLS_MODE" in
  acme | internal) ;;
  *)
    echo "S4N_TLS_MODE must be acme or internal" >&2
    exit 1
    ;;
esac

printf '%s' "$S4N_ACME_EMAIL" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' || {
  echo "S4N_ACME_EMAIL is invalid" >&2
  exit 1
}

docs_host="${S4N_DOCS_HOST:-}"
if [ -n "$docs_host" ]; then
  host_ok "$docs_host" || {
    echo "S4N_DOCS_HOST is invalid" >&2
    exit 1
  }
  if [ "$docs_host" = "$S4N_DOMAIN" ] || [ "$docs_host" = "$S4N_OVERLAY_HOST" ]; then
    echo "S4N_DOCS_HOST must be its own hostname" >&2
    exit 1
  fi
fi

tls_line=""
hsts_block=""
if [ "$S4N_TLS_MODE" = "internal" ]; then
  tls_line="	tls internal"
else
  hsts_block='	header {
		Strict-Transport-Security "max-age=31536000"
	}'
fi

{
  cat << EOF
{
	admin 127.0.0.1:2019
	email ${S4N_ACME_EMAIL}
}

(s4n_upstream) {
	reverse_proxy api:8787 {
		header_up Host {host}
		header_up X-Real-IP {remote_host}
		flush_interval -1
	}
}

${S4N_DOMAIN} {
	encode zstd gzip
${tls_line}
${hsts_block}
	@s4n_api path /api /api/*
	handle @s4n_api {
		import s4n_upstream
	}
	@s4n_ws path /ws /ws/*
	handle @s4n_ws {
		import s4n_upstream
	}
	handle {
		reverse_proxy web:8080
	}
}

${S4N_OVERLAY_HOST} {
	encode zstd gzip
${tls_line}
${hsts_block}
	@s4n_api path /api /api/*
	handle @s4n_api {
		import s4n_upstream
	}
	@s4n_ws path /ws /ws/*
	handle @s4n_ws {
		import s4n_upstream
	}
	handle {
		reverse_proxy overlay:8080
	}
}
EOF

  if [ -n "$docs_host" ]; then
    cat << EOF
${docs_host} {
	encode zstd gzip
${tls_line}
${hsts_block}
	reverse_proxy docs:8080
}
EOF
  fi
} > /etc/caddy/Caddyfile

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
