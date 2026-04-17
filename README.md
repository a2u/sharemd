# sharemd

Lightweight markdown sharing service. Upload `.md` files via API or CLI, get a clean URL with beautifully rendered content. Supports single files and directory bundles with hierarchy. Dark/light theme, syntax highlighting, Google OAuth, storage quotas. AI-agent friendly. Self-hosted, no database — just Node.js and the filesystem.

## Quick Start

```bash
npm install
cp .env.example .env  # edit values
npm start
```

Or with Docker:

```bash
docker compose up -d
```

Server runs at `http://localhost:3737`.

## Install on a VPS (Docker) — step by step

Tested on fresh Ubuntu 22.04/24.04. Copy-paste the commands one block at a time.

### 1. SSH into your server

```bash
ssh root@YOUR_SERVER_IP
```

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 3. Grab the compose file and `.env` template

```bash
mkdir sharemd && cd sharemd
curl -O https://raw.githubusercontent.com/a2u/sharemd/main/docker-compose.prod.yml
curl -o .env https://raw.githubusercontent.com/a2u/sharemd/main/.env.example
mv docker-compose.prod.yml docker-compose.yml
```

No `git clone` needed — the prebuilt image is pulled from `ghcr.io/a2u/sharemd`.

### 4. Edit the `.env` file

```bash
nano .env
```

Set at minimum:

```
BASE_URL=https://share.yourdomain.com
SITE_DOMAIN=share.yourdomain.com
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

Google OAuth is optional — leave `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` empty if you don't need web login (you can still upload via API using a token in `data/users.json`).

### 5. Start the container

```bash
docker compose up -d
```

Check it's running:

```bash
curl http://localhost:3737/health
# → {"status":"ok","uptime":...}
```

### 6. Point your domain at the server

In your DNS provider, create an `A` record:
`share.yourdomain.com` → `YOUR_SERVER_IP`

### 7. Add HTTPS with nginx + Let's Encrypt (if you use nginx)

Skip this step if you're using a different reverse proxy (Caddy, Traefik, etc.) or already have one set up.

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/sharemd`:

```bash
nano /etc/nginx/sites-available/sharemd
```

Paste:

```nginx
server {
    server_name share.yourdomain.com;
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

Enable it and issue a cert:

```bash
ln -s /etc/nginx/sites-available/sharemd /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d share.yourdomain.com
```

Done. Open `https://share.yourdomain.com` in a browser.

### Viewing logs

```bash
docker compose logs -f
```

## Updating

New versions are published to `ghcr.io/a2u/sharemd` automatically on every push to `main` and on version tags. To pull the latest and restart:

```bash
cd sharemd
docker compose pull
docker compose up -d
```

Your data in `./data/` is not touched — it's on a host volume, so the container can be recreated without losing files or tokens.

Check which version is running:

```bash
curl http://localhost:3737/health
# → {"status":"ok","uptime":12,"version":"0.9.0"}
```

The version number is also shown in the footer of the landing page.

To pin a specific version instead of always tracking `latest`, edit `docker-compose.yml`:

```yaml
    image: ghcr.io/a2u/sharemd:0.9.0
```

## Install the CLI

Log in at `https://your-instance/` and open `/panel`. Copy the install command shown there and run it once on any machine:

```bash
curl -fsSL "https://your-instance/install?token=shmd_tk_xxxx" | bash
```

This drops the `sharemd` binary into `~/.local/bin/sharemd` and wires your shell (`.bashrc` / `.zshrc`) with the right token and URL. Needs `curl` and `jq`.

## Share files

```bash
# Single file
sharemd article.md
# → https://share.example.com/article.md

# Directory
sharemd docs/
# → https://share.example.com/docs
```

## API

All API endpoints require `Authorization: Bearer <token>` header. Token is in your `/panel` after Google login.

```bash
# Upload
curl -X POST https://share.example.com/api/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHAREMD_TOKEN" \
  -d '{"content": "# Hello\nWorld", "filename": "hello.md"}'

# List files
curl https://share.example.com/api/files \
  -H "Authorization: Bearer $SHAREMD_TOKEN"

# Delete
curl -X DELETE https://share.example.com/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHAREMD_TOKEN" \
  -d '{"path": "hello.md"}'
```

See [docs/api.md](docs/api.md) for the full API reference.

## Features

- Server-side markdown rendering (markdown-it + highlight.js)
- Dark/light theme toggle (persisted in localStorage)
- Sticky header with clickable path breadcrumb
- Raw markdown view (`?raw`)
- In-page delete button (owner only) with confirmation modal
- Google OAuth login + auto-registration
- Registration allowlist by email/domain (`ALLOWED_EMAILS`)
- User panel with storage bar, file browser (live search + pagination), and one-line CLI installer
- One-liner install: `curl … | bash` drops the CLI with token pre-configured
- Per-user storage quotas
- Directory uploads with hierarchy preserved
- Duplicate detection with overwrite prompt
- AI skill for agent integration
- Docker deployment with health checks and multi-arch GHCR image

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port |
| `BASE_URL` | `http://localhost:3737` | Public URL for generated links |
| `DATA_DIR` | `./data` | Where files are stored on disk |
| `SITE_DOMAIN` | `sharemd` | Domain shown in header |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `ALLOWED_EMAILS` | — | Registration allowlist, comma-separated. `@domain.com` or full email. Empty = allow all |
| `ADMIN_EMAIL` | — | Admin contact shown on access-denied page |

## Tests

```bash
npm test  # 63 tests
```

## Documentation

- [Architecture](docs/architecture.md) — how it works under the hood
- [API Reference](docs/api.md) — all endpoints with examples
- [CLI Reference](docs/cli.md) — command-line usage
- [Deployment](docs/deployment.md) — Docker, reverse proxy, configuration

## Roadmap

- [ ] `/ai-skill` page — render `skill.md` as HTML for agents to discover
- [ ] Rate limiting
- [ ] File expiration / TTL — auto-delete shared files after N days
- [ ] Versioning — keep previous versions on overwrite, `?v=1` access
- [ ] AI formatting — `format: true` flag to auto-format raw text into clean markdown
- [ ] Webhooks — trigger external URL on upload/delete events
- [ ] CI/CD — GitHub Actions for tests and Docker image builds
- [ ] Password-protected shares

## License

[MIT](LICENSE) — Vitalii Rudnykh
