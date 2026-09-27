# syntax=docker/dockerfile:1

# ---- builder ---------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

# Prisma's query engine is linked against libssl3, which the slim image drops.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# node_modules is lifted whole from the builder: it already carries the
# generated client and the platform engine, so the deploy downloads nothing.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
