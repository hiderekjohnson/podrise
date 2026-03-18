#!/bin/bash
set -e
npm install

npx drizzle-kit generate 2>/dev/null || true
npx drizzle-kit push --force 2>&1 || echo "drizzle-kit push had interactive prompts; run manually if needed"
