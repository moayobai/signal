FROM node:22-alpine AS builder
WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types ./packages/types
COPY apps/server ./apps/server
COPY knowledge ./knowledge

# Install the same pnpm major used by CI and packageManager metadata
RUN npm install -g pnpm@9.15.9

# Install server deps
RUN pnpm install --filter server --frozen-lockfile

# Build
RUN pnpm --filter server run build

# --- runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/apps/server/dist/index.js ./dist/index.js
COPY --from=builder /app/knowledge ./knowledge

EXPOSE 8080
CMD ["node", "dist/index.js"]
