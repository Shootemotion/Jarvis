# ============================================================
# JARVIS API — production image (Render / any Docker host).
# Build context MUST be the repo root:  docker build -f apps/api/Dockerfile .
# ============================================================
FROM node:22-slim

# Prisma needs openssl at runtime; ca-certificates for outbound HTTPS (OpenAI/MP).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Copy the whole monorepo (node_modules/.next/etc. excluded via .dockerignore),
# then install only the API subtree + its workspace dependencies.
COPY . .
RUN pnpm install --frozen-lockfile --filter @jarvis/api...

# Build workspace packages in dependency order, generate the Prisma client, build the API.
RUN pnpm --filter @jarvis/config build \
  && pnpm --filter @jarvis/providers build \
  && pnpm --filter @jarvis/ai-router build \
  && pnpm --filter @jarvis/api exec prisma generate \
  && pnpm --filter @jarvis/api build

ENV NODE_ENV=production
# Keep V8 heap bounded so we fit small instances (Render free = 512MB RAM).
ENV NODE_OPTIONS=--max-old-space-size=460
EXPOSE 4010

# Apply pending migrations, then boot. Call prisma/node directly (no pnpm wrapper)
# so we don't hold two heavy Node processes at once on a memory-constrained box.
# migrate deploy is idempotent and exits before the server starts.
WORKDIR /app/apps/api
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
