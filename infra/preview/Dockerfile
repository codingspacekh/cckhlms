# preview.cckh.dev: serves the student-page frame with its own CSP and no cookies (ADR 0001).
FROM node:24.21.0-alpine3.24
WORKDIR /srv
COPY preview/ ./
ENV PREVIEW_PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "server.mjs"]
