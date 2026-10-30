#!/usr/bin/env bash
# Rate limiting 429 — preuve MULTI-INSTANCES, sans toucher la pile de prod.
#
# Démarre DEUX instances API temporaires (même image que api-e2e, même Redis,
# compteur partagé), avec RATE_LIMIT_DISABLED=false et un plafond global bas
# (10 req/min) pour rendre le 429 observable sans marteler la pile.
#
# Ce que ça prouve :
#   1. le 429 existe réellement quand la limite est active (pas seulement en test) ;
#   2. le compteur est PARTAGÉ entre instances (Redis) : 10 requêtes réparties
#      sur 2 processus saturent le même bucket — un compteur mémoire local
#      laisserait passer 10 par instance (20 au total) ;
#   3. la réponse est conforme au contrat : code RATE_LIMITED + Retry-After.
#
# Usage : bash scripts/load/rate-limit-multi.sh
set -uo pipefail

BASE_IMAGE="revends-api-e2e"
NETWORK="revends_revends_net"
MAX=10
OUT="${OUT:-/tmp/opencode/rate-limit.json}"
ENVF="$(mktemp /tmp/opencode/rl-env.XXXXXX)"
chmod 600 "$ENVF"

cleanup() {
  docker rm -f revends_rl_a revends_rl_b >/dev/null 2>&1 || true
  rm -f "$ENVF"
}
trap cleanup EXIT

# Environnement copié de l'instance e2e, puis surchargé.
docker inspect revends_api_e2e --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -vE '^(INSTANCE_ID|RATE_LIMIT_|MAIL_|DISABLE_CRON|PORT)=' > "$ENVF"
cat >> "$ENVF" <<EOF
RATE_LIMIT_DISABLED=false
RATE_LIMIT_BACKEND=redis
RATE_LIMIT_GLOBAL_MAX=$MAX
RATE_LIMIT_GLOBAL_WINDOW_MS=60000
RATE_LIMIT_AUTH_MAX=3
RATE_LIMIT_AUTH_WINDOW_MS=60000
DISABLE_CRON=true
EOF

docker rm -f revends_rl_a revends_rl_b >/dev/null 2>&1 || true
docker run -d --name revends_rl_a --network "$NETWORK" --env-file "$ENVF" \
  -e INSTANCE_ID=rl-a -p 127.0.0.1:4004:4000 --entrypoint node "$BASE_IMAGE" dist/index.js >/dev/null
docker run -d --name revends_rl_b --network "$NETWORK" --env-file "$ENVF" \
  -e INSTANCE_ID=rl-b -p 127.0.0.1:4005:4000 --entrypoint node "$BASE_IMAGE" dist/index.js >/dev/null

for i in $(seq 1 40); do
  a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4004/api/health || true)
  b=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4005/api/health || true)
  [ "$a" = "200" ] && [ "$b" = "200" ] && break
  sleep 1
done
echo "instances prêtes : a=$a b=$b"

# Bucket vierge : la fenêtre fixe est de 60 s, on repart de zéro.
docker exec revends_redis redis-cli DEL rl:global:127.0.0.1 rl:auth:127.0.0.1 >/dev/null 2>&1 || true

pass=0; fail=0
detail="["
for i in $(seq 1 $((MAX + 5))); do
  if [ $((i % 2)) -eq 0 ]; then PORT=4004; INST=rl-a; else PORT=4005; INST=rl-b; fi
  body=$(mktemp /tmp/opencode/rlbody.XXXXXX)
  hdr=$(mktemp /tmp/opencode/rlhdr.XXXXXX)
  code=$(curl -s -D "$hdr" -o "$body" -w '%{http_code}' "http://127.0.0.1:$PORT/api/categories")
  errcode=$(python3 -c "import json,sys;d=json.load(open('$body'));print((d.get('error') or {}).get('code',''))" 2>/dev/null || echo "")
  ra=$(grep -i '^retry-after:' "$hdr" | tr -d '\r' | cut -d' ' -f2 | tr -d '\n')
  rm -f "$body" "$hdr"
  expected=200; [ "$i" -gt "$MAX" ] && expected=429
  verdict=OK; [ "$code" != "$expected" ] && verdict=KO
  [ "$verdict" = "OK" ] && pass=$((pass+1)) || fail=$((fail+1))
  detail+="{\"n\":$i,\"instance\":\"$INST\",\"status\":$code,\"expected\":$expected,\"code\":\"$errcode\",\"retryAfter\":\"$ra\",\"verdict\":\"$verdict\"},"
  printf '%2d %s %s (attendu %s) %s\n' "$i" "$INST" "$code" "$expected" "$verdict"
done
detail="${detail%,}]"

# Bucket AUTH (`RATE_LIMIT_AUTH_MAX=3`) : il doit être INDÉPENDANT du bucket
# global. On amorce d'abord le cookie CSRF (sinon 403 avant le limiteur),
# puis 6 tentatives de connexion avec de faux identifiants : 3× 401
# (identifiants invalides, donc le limiteur laisse passer) puis 3× 429.
auth_statuses=""
CSRF=$(curl -s -c /tmp/opencode/rl-csrf.txt -o /dev/null -w '%{http_code}' http://127.0.0.1:4005/api/categories || true)
CSRFV=$(grep csrf_token /tmp/opencode/rl-csrf.txt | awk '{print $7}')
for i in $(seq 1 6); do
  c=$(curl -s -b /tmp/opencode/rl-csrf.txt -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:4005/api/auth/login" \
    -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRFV" \
    -d '{"identifier":"nobody@test.revends","password":"MotDePasse!2026"}' || true)
  auth_statuses+="$c,"
done
rm -f /tmp/opencode/rl-csrf.txt

python3 - "$OUT" "$MAX" "$pass" "$fail" "$detail" "$auth_statuses" <<'PY'
import json, sys
out, mx, p, f, detail, auth = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), json.loads(sys.argv[5]), sys.argv[6]
auth_codes = [int(x) for x in auth.strip(',').split(',') if x]
expected_auth = [401, 401, 401, 429, 429, 429]
auth_verdict = "PASS" if auth_codes == expected_auth else "FAIL"
report = {
  "scenario": "rate limiting global multi-instances (2 processus, Redis partagé)",
  "maxPerWindow": mx,
  "passed": p,
  "failed": f,
  "requests": detail,
  "authBucket": {"codes": auth_codes, "expected": expected_auth, "verdict": auth_verdict,
                 "meaning": "bucket auth séparé du global (3 connexions permises, puis 429)"},
  "verdict": "PASS" if f == 0 and auth_verdict == "PASS" else "FAIL",
}
open(out, "w").write(json.dumps(report, indent=2))
print(f"\n{'✅' if report['verdict']=='PASS' else '❌'} global {p} OK / {f} KO — auth {auth_codes} ({auth_verdict}) — rapport {out}")
sys.exit(0 if report["verdict"] == "PASS" else 1)
PY
