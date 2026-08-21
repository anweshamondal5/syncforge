# SyncForge: Deployment & Reproducible Setup Guide

This guide provides instructions to build, test, and deploy **SyncForge** across local development environments, Docker containers, and production cloud infrastructure (Render + Managed PostgreSQL).

---

## 1. Cloud Deployment with Render (Blueprint / render.yaml)

SyncForge includes a unified `render.yaml` blueprint defining:
1. **`syncforge-backend`**: Node.js 20 Web Service on `0.0.0.0:$PORT` with WSS support and `/health` health check.
2. **`syncforge-frontend`**: High-performance Static Site with SPA routing rewrite (`/* -> /index.html`).
3. **`syncforge-postgres`**: Managed PostgreSQL 16 database.

### Step-by-Step Render Deployment:
1. Push your repository to GitHub.
2. Log into [Render.com](https://render.com) and navigate to **Blueprints**.
3. Click **New Blueprint Instance** and select your SyncForge repository.
4. Render will automatically detect `render.yaml` and provision the Web Service, Static Site, and PostgreSQL database with wired environment variables.
5. Once deployed, verify your public URLs:
   - Frontend: `https://syncforge-frontend.onrender.com`
   - Backend API & Health: `https://syncforge-backend.onrender.com/health`
   - WebSocket Gateway: `wss://syncforge-backend.onrender.com/ws/:docId`

---

## 2. Quickstart with Docker Compose (Recommended for Self-Hosting)

SyncForge provides an orchestrated `docker-compose.yml` including:
1. **PostgreSQL 16 Database** (with automated schema migrations & healthcheck)
2. **SyncForge Real-Time CRDT Server** (Node.js 20 on port 4000)
3. **SyncForge Client Web App** (Nginx on port 3000 with WebSocket reverse proxy & SPA routing)

### Prerequisites
- Docker Engine $\ge 24.0$
- Docker Compose $\ge 2.20$

### Step-by-Step Launch
```bash
# 1. Copy the environment configuration
cp .env.example .env

# 2. Build and launch all services in detached mode
docker compose up --build -d

# 3. Verify container health
docker compose ps

# 4. Stream real-time sync logs
docker compose logs -f server
```

Once running, access the services:
- **Client Application**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Healthcheck**: [http://localhost:4000/health](http://localhost:4000/health)
- **WebSocket Gateway**: `ws://localhost:4000/ws/:docId`

To stop and remove containers:
```bash
docker compose down -v
```

---

## 3. Local Development Setup (Bare Metal)

### Prerequisites
- Node.js $\ge 20.0.0$
- npm $\ge 10.0.0$
- (Optional) PostgreSQL $\ge 14$ or embedded SQLite (used automatically when `DATABASE_URL` is omitted)

### Step-by-Step Launch
```bash
# 1. Install all dependencies across the monorepo
npm install

# 2. Build the shared TypeScript library
npm run build:shared

# 3. Start development servers concurrently (Backend on :3001, Vite frontend on :5173)
npm run dev
```

---

## 4. Production Monorepo Build

To compile all packages to optimized JavaScript:
```bash
# Compile shared, client, and server workspaces
npm run build

# Start the compiled production backend server
npm run start
```

---

## 5. Automated Testing Suite Matrix

SyncForge includes a multi-tiered verification suite:

### A. Backend Unit & Concurrency Tests (Node.js Test Runner)
```bash
npm run test
```
*Executes 37 tests across 7 suites covering:*
- CRDT Strong Eventual Consistency
- Binary WebSocket Synchronization
- Dual-Tier Persistence & Cold Server Restarts
- 16 Chaos & Failure Mode Scenarios (rapid typing, out-of-order delivery, dropped connections)
- Security & Reliability Hardening (Payload caps, Rate limiters, Malformed frame catchers, Memory leak prevention)

### B. Frontend Component Tests (Vitest + JSDOM)
```bash
npm run test:client
```
*Executes component unit tests covering:*
- Landing page CTAs & hero rendering
- Document list search filtering, quick-launch templates & delete confirmation
- Connection indicator state badges & offline simulation toggle
- ShareModal live collaborator roster & link copying

### C. End-to-End Multi-Browser Tests (Playwright)
```bash
npm run test:e2e
```
*Launches real Chromium browser sessions to verify:*
- Multi-client simultaneous typing and live cursor tracking
- 3-way collaborator presence and disconnect cleanup
- Network partition offline editing and reconnection convergence

### D. Distributed Performance Benchmark
```bash
npm run benchmark
```
*Measures actual p50/p95/p99 latencies for CRDT mutations, WebSocket RTT, reconnect catchup, and server memory footprint under concurrent load.*

---

## 6. Environment Variables Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Runtime mode (`development` or `production`) |
| `HOST` | `0.0.0.0` | Host binding for Node.js server |
| `PORT` | `3001` | HTTP and WebSocket server listen port |
| `DATABASE_URL` | `""` | PostgreSQL connection string. Defaults to embedded SQLite if blank |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (comma-separated in production) |
| `DOC_SAVE_DEBOUNCE_MS` | `2000` | Write buffer flush debounce interval (ms) |
| `DOC_SNAPSHOT_THRESHOLD` | `50` | Number of update chunks triggering snapshot compaction |
| `VITE_API_URL` | `""` | Base API URL for frontend (e.g. `https://syncforge-backend.onrender.com`) |
| `VITE_WS_URL` | `""` | Base WebSocket URL for frontend (e.g. `wss://syncforge-backend.onrender.com`) |
| `MAX_PAYLOAD_BYTES` | `5242880` | Maximum WebSocket frame size ($5\text{ MB}$) |
| `RATE_LIMIT_MSGS_PER_SEC` | `300` | Abusive connection message threshold |
