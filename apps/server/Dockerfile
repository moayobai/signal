FROM node:22-alpine AS builder
WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types ./packages/types
COPY apps/server ./apps/server
COPY knowledge ./knowledge

# Install the same pnpm major used by CI and packageManager metadata
RUN npm install -g pnpm@9.15.9

# Install server runtime deps plus dashboard build deps used by server build:dashboard.
RUN pnpm install --filter server --filter dashboard --frozen-lockfile

# Build
RUN pnpm --filter server run build

# --- runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app/apps/server

ENV NODE_ENV=production

# The server bundle intentionally externalizes native/runtime modules such as
# better-sqlite3, @fastify/static, @fastify/helmet, and ws. Keep pnpm's
# symlinked node_modules layout intact in the runtime image.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/public ./public
COPY --from=builder /app/knowledge ./knowledge

EXPOSE 8080
CMD ["node", "dist/index.js"]
