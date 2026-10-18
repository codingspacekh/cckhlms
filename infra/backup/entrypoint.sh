#!/bin/sh
set -eu
case "${1:-cron}" in
  cron) exec crond -f -l 8 ;;
  backup-now) exec backup.sh ;;
  restore-latest) exec restore.sh latest ;;
  restore) shift; exec restore.sh "$@" ;;
  *) exec "$@" ;;
esac
