# Encrypted backups to Cloudflare R2 (NFR-04, architecture §9.5). pg_dump comes from the same
# PostgreSQL version as the database.
FROM postgres:18.6-alpine3.24
RUN apk add --no-cache age rclone curl tzdata
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
COPY crontab /etc/crontabs/root
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["cron"]
