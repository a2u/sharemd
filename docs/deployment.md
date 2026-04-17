# Deployment

## Docker

### Option A — pull the prebuilt image (recommended)

A multi-arch image (`amd64` + `arm64`) is published to GHCR on every push to `main` and on version tags:

```
ghcr.io/a2u/sharemd:latest
ghcr.io/a2u/sharemd:0.9.0   # specific version
ghcr.io/a2u/sharemd:sha-<commit>
```

Minimal compose file (`docker-compose.yml`):

```yaml
services:
  sharemd:
    image: ghcr.io/a2u/sharemd:latest
    container_name: sharemd
    restart: unless-stopped
    ports:
      - "3737:3737"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
```

Bring it up:

```bash
docker compose up -d
```

### Option B — build from source

```bash
docker compose up -d  # uses the Dockerfile in the repo
```

Or manually:

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

### Updating

```bash
cd /path/to/sharemd
docker compose pull
docker compose up -d
```

Data in `./data/` is on a host volume — the container can be recreated freely without losing files, tokens, or the session secret.

### Health check

The container includes a built-in health probe that Docker checks every 30s:

```bash
curl http://localhost:3737/health
# → {"status":"ok","uptime":42,"version":"0.9.0"}
```

The same version is shown in the landing-page footer.

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
| `ALLOWED_EMAILS` | No | Comma-separated registration allowlist. `@domain.com` matches whole domain; full email matches one user. Empty = allow anyone |
| `ADMIN_EMAIL` | No | Admin contact shown on `/login/denied` |

### Restricting registration

To limit who can register via Google OAuth on a public instance, set `ALLOWED_EMAILS`:

```
ALLOWED_EMAILS=@cloudlinux.com,@anthropic.com,partner@gmail.com
ADMIN_EMAIL=admin@cloudlinux.com
```

- `@domain.com` — anyone at that domain can register
- `user@domain.com` — only that specific user
- Multiple entries — comma-separated, mix as needed
- Empty or unset — anyone with a Google account can register (default)

Users already in `data/users.json` keep access even if you tighten the list later. Rejected logins land on `/login/denied` with the `ADMIN_EMAIL` as the contact link.

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

## Reverse proxy

### nginx

```nginx
server {
    server_name share.example.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3737;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For HTTPS, use certbot: `certbot --nginx -d share.example.com`.

### Caddy

Caddy handles TLS automatically via Let's Encrypt. A single block in `/etc/caddy/Caddyfile` is enough:

```
share.example.com {
    reverse_proxy 127.0.0.1:3737
}
```

Then `systemctl reload caddy`.

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
