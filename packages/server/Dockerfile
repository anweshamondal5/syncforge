# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

# Copy root workspace and package manifests
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY tests/e2e/package.json ./tests/e2e/

# Install dependencies across all workspaces
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build shared and server TypeScript projects
RUN npm run build:shared
RUN npm run build:server

# --- Production Runtime Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies for native bindings
RUN apk add --no-cache libstdc++

# Copy package manifests
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Copy installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
