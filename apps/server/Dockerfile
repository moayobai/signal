FROM node:22-alpine AS builder
WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types ./packages/types
COPY apps/server ./apps/server
COPY knowledge ./knowledge

# Install the same pnpm major used by CI and packageManager metadata
RUN npm install -g pnpm@9.15.9

# Install server + dashboard deps (the server build also builds the dashboard)
RUN pnpm install --filter server --filter dashboard --frozen-lockfile

# Build (bundles server → apps/server/dist, dashboard → apps/server/public)
RUN pnpm --filter server run build

# Re-install production-only deps so the runtime image has the modules
# esbuild leaves external (better-sqlite3, dotenv, @fastify/static, ws).
RUN rm -rf node_modules apps/server/node_modules apps/server/dashboard/node_modules \
  && pnpm install --filter server --prod --frozen-lockfile

# --- runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# pnpm's node_modules are symlinks into the root store — keep the same layout.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/public ./apps/server/public
# Loaded from process.cwd()/knowledge by the live prompt builder
COPY --from=builder /app/knowledge ./knowledge

EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
