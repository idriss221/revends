#!/bin/bash
# docker-entrypoint.sh — Validation des secrets critiques avant démarrage
# Exit 1 si une validation échoue, sinon exec "$@" (migrate → seed → start)

set -euo pipefail

echo "[entrypoint] Validation des secrets critiques..."

# Fonction de validation générique
validate_var() {
  local var_name="$1"
  local var_value="${!var_name:-}"
  local min_length="$2"
  shift 2
  local weak_patterns=("$@")

  if [[ -z "$var_value" ]]; then
    echo "[entrypoint] ERREUR: $var_name n'est pas définie"
    return 1
  fi

  if [[ ${#var_value} -lt $min_length ]]; then
    echo "[entrypoint] ERREUR: $var_name doit faire au moins $min_length caractères (actuel: ${#var_value})"
    return 1
  fi

  for pattern in "${weak_patterns[@]}"; do
    if [[ "$var_value" =~ $pattern ]]; then
      echo "[entrypoint] ERREUR: $var_name contient un motif faible: $pattern"
      return 1
    fi
  done

  echo "[entrypoint] OK: $var_name validé (${#var_value} caractères)"
  return 0
}

# SESSION_SECRET — min 32, pas de valeurs par défaut/démo
SESSION_SECRET_WEAK_PATTERNS=(
  '^dev'
  '^change'
  '^test'
)
validate_var "SESSION_SECRET" 32 "${SESSION_SECRET_WEAK_PATTERNS[@]}" || exit 1

# ADMIN_PASSWORD — min 12, pas de motifs démo
ADMIN_PASSWORD_WEAK_PATTERNS=(
  '^dev'
  '^change'
  '^test'
  '^admin$'
  '^password$'
  '^123456'
)
validate_var "ADMIN_PASSWORD" 12 "${ADMIN_PASSWORD_WEAK_PATTERNS[@]}" || exit 1

# POSTGRES_PASSWORD (ou DB_PASSWORD) — min 12, pas revends_dev_password
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"
DB_PASSWORD_WEAK_PATTERNS=(
  '^revends_dev_password$'
)
validate_var "POSTGRES_PASSWORD" 12 "${DB_PASSWORD_WEAK_PATTERNS[@]}" || exit 1

echo "[entrypoint] Tous les secrets sont valides. Démarrage de l'application..."

# Exécuter la commande passée en argument (CMD)
exec "$@"