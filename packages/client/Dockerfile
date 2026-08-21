# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/
COPY tests/e2e/package.json ./tests/e2e/

# Install dependencies across all workspaces
RUN npm install

# Copy source codes
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Build shared library and client web application
RUN npm run build:shared
RUN npm run build:client

# --- Production Stage ---
FROM nginx:alpine

# Remove default nginx html files
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend assets from builder stage
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Copy custom Nginx configuration with WebSocket reverse proxy
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
