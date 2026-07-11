#!/bin/sh
set -eu

: "${SMOKE_BASE_URL:?Falta SMOKE_BASE_URL, por ejemplo https://pulso.example}"
command -v curl >/dev/null 2>&1 || { echo "Falta curl" >&2; exit 1; }

curl_flags='--silent --show-error'
if [ "${SMOKE_INSECURE_TLS:-}" = "yes" ]; then
  curl_flags="$curl_flags --insecure"
fi

tmp_headers=$(mktemp)
trap 'rm -f "$tmp_headers"' EXIT HUP INT TERM

# shellcheck disable=SC2086
curl $curl_flags --fail "$SMOKE_BASE_URL/api/health" >/dev/null
# shellcheck disable=SC2086
curl $curl_flags --fail -D "$tmp_headers" "$SMOKE_BASE_URL/api/readiness" >/dev/null

grep -qi '^x-request-id:' "$tmp_headers" || { echo "Falta x-request-id" >&2; exit 1; }
grep -qi '^x-content-type-options: nosniff' "$tmp_headers" || { echo "Falta nosniff" >&2; exit 1; }
grep -qi '^content-security-policy:' "$tmp_headers" || { echo "Falta CSP" >&2; exit 1; }

status_register=$(curl $curl_flags --output /dev/null --write-out '%{http_code}' "$SMOKE_BASE_URL/register")
status_personal=$(curl $curl_flags --output /dev/null --write-out '%{http_code}' -X POST "$SMOKE_BASE_URL/api/personal/suggest")
[ "$status_register" = "404" ] || { echo "/register devolvió $status_register, se esperaba 404" >&2; exit 1; }
[ "$status_personal" = "404" ] || { echo "/api/personal/suggest devolvió $status_personal, se esperaba 404" >&2; exit 1; }

echo "Smoke público: OK"
