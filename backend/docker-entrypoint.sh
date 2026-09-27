#!/bin/sh
set -e

# Migrations always, on every boot. They are additive and idempotent.
npx prisma migrate deploy

# Opt-in, and only into an empty database. The seed truncates before writing, so
# an unguarded run at boot would erase the jury's data mid-demo.
if [ "$SEED_ON_BOOT" = "true" ]; then
  SEED_ONLY_IF_EMPTY=true node dist-seed/prisma/seed.js
fi

exec node dist/main
