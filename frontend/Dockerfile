# syntax=docker/dockerfile:1

# ---- builder ---------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Vite bakes env vars into the bundle at build time, so the API URL has to be
# known HERE. At runtime it is already frozen in the JavaScript.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# The nginx image runs envsubst over this template at startup, substituting only
# names that exist in the environment — so ${PORT} is replaced and nginx's own
# $uri survives untouched.
COPY --chmod=644 nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Railway injects PORT. The default keeps `docker run` working on its own.
ENV PORT=8080
EXPOSE 8080
