#!/bin/sh
# 由 compose 的環境變數寫出 Caddyfile。網域只接受主機名，避免把指令寫進設定。
# acme / internal：這台 Caddy 自己終止 TLS（compose.prod.yaml）。
# off / proxy：只聽 :80，不申請憑證。給前面已有代理的 Coolify（compose.coolify.yaml）。
set -eu

host_ok() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$'
}

: "${S4N_DOMAIN:?S4N_DOMAIN is required}"
: "${S4N_OVERLAY_HOST:?S4N_OVERLAY_HOST is required}"
: "${S4N_TLS_MODE:?S4N_TLS_MODE is required}"

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

proxy_mode=0
case "$S4N_TLS_MODE" in
  acme | internal) ;;
  off | proxy) proxy_mode=1 ;;
  *)
    echo "S4N_TLS_MODE must be acme, internal, off, or proxy" >&2
    exit 1
    ;;
esac

if [ "$proxy_mode" -eq 0 ]; then
  : "${S4N_ACME_EMAIL:?S4N_ACME_EMAIL is required}"
  printf '%s' "$S4N_ACME_EMAIL" | grep -Eq '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' || {
    echo "S4N_ACME_EMAIL is invalid" >&2
    exit 1
  }
fi

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

# acme / internal 維持原本的上游：Caddy 是第一個代理，預設會把 X-Forwarded-* 收成直連的那一跳。
upstream_block='	reverse_proxy api:8787 {
		header_up Host {host}
		header_up X-Real-IP {remote_host}
		flush_interval -1
	}'
global_block="{
	admin 127.0.0.1:2019
	email ${S4N_ACME_EMAIL:-}
}"
site_prefix=""

if [ "$proxy_mode" -eq 1 ]; then
  # 前面還有 Coolify 的代理。私有網段才可信，並從右邊取第一個公開位址，避免客戶端在左邊塞假 IP。
  # 再把那一個位址寫成唯一的 X-Forwarded-For。API 的 S4N_TRUST_PROXY=1 只看最後一跳。
  # 對外已經是 https，這裡固定寫回 https，不要沿用 Caddy 自己看到的 http。
  global_block='{
	admin 127.0.0.1:2019
	auto_https off
	servers {
		trusted_proxies static private_ranges
		trusted_proxies_strict
	}
}'
  upstream_block='	reverse_proxy api:8787 {
		header_up Host {host}
		header_up X-Real-IP {http.vars.client_ip}
		header_up X-Forwarded-For {http.vars.client_ip}
		header_up X-Forwarded-Proto https
		flush_interval -1
	}'
  site_prefix="http://"
fi

dashboard_site="${site_prefix}${S4N_DOMAIN}"
overlay_site="${site_prefix}${S4N_OVERLAY_HOST}"
docs_site="${site_prefix}${docs_host}"
caddyfile="${S4N_CADDYFILE:-/etc/caddy/Caddyfile}"

{
  cat << EOF
${global_block}

(s4n_upstream) {
${upstream_block}
}

${dashboard_site} {
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

${overlay_site} {
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
${docs_site} {
	encode zstd gzip
${tls_line}
${hsts_block}
	reverse_proxy docs:8080
}
EOF
  fi
} > "$caddyfile"

caddy fmt --overwrite "$caddyfile"
caddy validate --config "$caddyfile" --adapter caddyfile
exec caddy run --config "$caddyfile" --adapter caddyfile
