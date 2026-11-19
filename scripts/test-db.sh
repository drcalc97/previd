#!/usr/bin/env bash
# Reset + migrate the local *_test database (requires a local Postgres, see TESTING.md).
set -euo pipefail
set -a; source .env.test; set +a
npx tsx scripts/db.ts reset
npx tsx scripts/db.ts migrate
npx tsx scripts/db.ts setup-app
