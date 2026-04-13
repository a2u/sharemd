# Deployment

## Docker

### Build and run

```bash
docker compose up -d
```

This builds the image and starts the container. Data is persisted in `./data/` via volume mount.

### Manual Docker build

```bash
docker build -t sharemd .
docker run -d \
  --name sharemd \
  -p 3737:3737 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  sharemd
```

### Health check

The container includes a built-in health check:

```bash
curl http://localhost:3737/health
# → {"status":"ok","uptime":42}
```

Docker checks this automatically every 30s.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3737) |
| `BASE_URL` | Yes | Public URL, e.g. `https://share.example.com` |
| `DATA_DIR` | No | Storage path (default: `./data`) |
| `SITE_DOMAIN` | No | Domain shown in header (default: `sharemd`) |
| `GOOGLE_CLIENT_ID` | For login | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For login | Google OAuth client secret |

## Data persistence

All user data lives in `data/`:

```
data/
  users.json          ← user registry (tokens, emails, limits)
  .session-secret     ← auto-generated HMAC key for session cookies
  1/                  ← superadmin files
    article.md
    docs/
      guide.md
  2/                  ← user 2 files
    notes.md
```

Back up `data/` to preserve everything. The `.session-secret` file is auto-generated on first run — if you lose it, existing session cookies become invalid (users just re-login).

## Reverse proxy (nginx)

```nginx
server {
    server_name share.example.com;

    location / {
        proxy_pass http://127.0.0.1:3737;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For HTTPS, use certbot: `certbot --nginx -d share.example.com`

## Without Docker

```bash
npm install
cp .env.example .env  # edit values
npm start
```

Or with auto-reload for development:

```bash
npm run dev
```
