# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build API + Worker ────────────────────────────────────────────
FROM node:20-alpine AS build-api
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json nest-cli.json ./
COPY src ./src
RUN pnpm build:api

# ─── Stage 3: Build Next.js frontend ───────────────────────────────────────
FROM node:20-alpine AS build-web
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
COPY web ./web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL__
RUN pnpm build:web

# ─── Stage 4: Production image ─────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache tini
WORKDIR /app

# Copy built API (NestJS compiles to dist/src/)
COPY --from=build-api /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
# Root package.json with "type":"module" for NestJS ESM
COPY package.json ./

# Copy Next.js standalone output
COPY --from=build-web /app/web/.next/standalone ./web-standalone
COPY --from=build-web /app/web/.next/static ./web-standalone/web/.next/static
# Force CommonJS in the standalone directory — Next.js server.js uses require()
# This overrides the root "type":"module" for anything under web-standalone/
RUN echo '{"type":"commonjs"}' > ./web-standalone/package.json

# Copy entrypoint
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001 3000

ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
