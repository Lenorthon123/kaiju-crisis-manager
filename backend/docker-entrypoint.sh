#!/bin/sh
set -e

# Migrations only. The seed is NOT run here: it truncates every table first, so
# a restart would Thanos-snap the jury's data mid-demo. Seed once, by hand.
npx prisma migrate deploy

exec node dist/main
