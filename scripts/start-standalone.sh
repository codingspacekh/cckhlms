#!/bin/sh
# Runs the production (standalone) server the same way the Docker image does: static files and
# migrations next to server.js. Used by the e2e tests; PORT defaults to 3100.
set -eu
cd "$(dirname "$0")/.."
cp -R .next/static .next/standalone/.next/
rm -rf .next/standalone/drizzle && cp -R drizzle .next/standalone/drizzle
cd .next/standalone
# HOSTNAME is set explicitly: shells often set it to the machine name, and Next.js listens on it.
PORT=${PORT:-3100} HOSTNAME=0.0.0.0 exec node server.js
