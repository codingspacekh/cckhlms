# Production image for the LMS app (Next.js standalone). Built in GitHub Actions, not on the server.
FROM node:24.21.0-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.21.0-alpine3.24 AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Keep idle connections longer than cloudflared does (90 s), so the app never closes one just as cloudflared reuses
# it: Node's default of 5 s dropped about 1 autosave in 2,000 in the M7 load test, which users would see as a 502.
ENV KEEP_ALIVE_TIMEOUT=95000
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
# uid/gid fixed: restored lesson files are given to this user (UPLOADS_OWNER in compose.prod.yaml).
RUN addgroup -S -g 101 app && adduser -S -u 100 -G app app && mkdir -p /app/uploads && chown app:app /app/uploads
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --chown=app:app infra/app/cluster.mjs ./cluster.mjs
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
# One server process per CPU: WEB_WORKERS (infra/app/cluster.mjs); compose.prod.yaml sets 2 for the 2-vCPU server.
ENV WEB_WORKERS=1
CMD ["node", "cluster.mjs"]
