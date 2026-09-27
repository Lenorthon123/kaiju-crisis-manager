#!/usr/bin/env bash
# Boots a throwaway PostgreSQL, applies the schema, runs the e2e suite, tears down.
set -euo pipefail

cd "$(dirname "$0")/.."

export DATABASE_URL="postgresql://kaiju:kaiju@localhost:55432/kaiju_test?schema=public"
export JWT_SECRET="e2e-secret-value-long-enough"
export NODE_ENV="test"
export PORT="0"

cleanup() {
  docker compose -f docker-compose.test.yml down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "> Starting the test database"
docker compose -f docker-compose.test.yml up -d --wait

echo "> Applying the schema"
npx prisma db push --skip-generate --accept-data-loss

echo "> Running the e2e suite"
npx jest --config ./test/jest-e2e.json --runInBand "$@"
