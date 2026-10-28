#!/bin/sh
# Runs once, when PostgreSQL first creates its data folder (compose.prod.yaml mounts it into
# /docker-entrypoint-initdb.d). Pre-launch review: the app and the backups connect as lms, which owns the lms
# database (so it can run the migrations) but is not a superuser, so SQL sent through the app can't run programs in
# the database container, read its files or change other roles. The superuser (postgres) is only used by hand,
# inside the container: `docker compose -f compose.prod.yaml exec db psql -U postgres`.
set -eu
psql -v ON_ERROR_STOP=1 -v pw="${LMS_DB_PASSWORD:?set in .env}" -v db="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
create role lms login password :'pw';
alter database :"db" owner to lms;
SQL
