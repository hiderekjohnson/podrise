#!/bin/bash
set -e
npm install

npx drizzle-kit generate 2>/dev/null || true
npx drizzle-kit push 2>&1 || echo "drizzle-kit push had issues; run manually if needed"
