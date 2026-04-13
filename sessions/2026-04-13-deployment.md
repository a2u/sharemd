# 2026-04-13 — Deployment

## What was done

Added Docker deployment files and health check endpoint.

## Changes

### Dockerfile
- Based on `node:22-alpine`
- Copies only runtime files (server.js, index.html, public/, bin/, package*.json)
- `npm ci --omit=dev` for production-only deps
- Volume at `/app/data` for persistent storage
- Built-in HEALTHCHECK via `/health` endpoint (30s interval)

### docker-compose.yml
- Single service, builds from Dockerfile
- Mounts `./data` as volume
- Loads `.env` file
- `restart: unless-stopped`

### .dockerignore
- Excludes: node_modules, data, .env, .git, tests, docs, sessions, *.md (except index.html)
- Keeps image minimal

### Health check endpoint
- `GET /health` → `{"status": "ok", "uptime": N}`
- Used by Docker HEALTHCHECK and can be used by load balancers / monitoring

### docs/deployment.md
- Docker and docker-compose instructions
- Manual Docker build command
- Nginx reverse proxy config with certbot
- Data persistence explanation
- Non-Docker setup

## Tests
37 total (was 36). New test:
- `GET /health` returns ok with uptime

## What's not done yet
- `/ai-skill` page
- Rate limiting
- File expiration / TTL
- CI/CD pipeline (GitHub Actions)
