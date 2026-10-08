# ---------- build stage ----------
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# sqlite3 — для бэкапов через CLI 
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./src/db/migrations

RUN mkdir -p /app/data /app/backups

CMD ["node", "dist/index.js"]