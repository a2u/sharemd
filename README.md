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

## Share files

```bash
# Single file
bin/sharemd article.md
# → https://share.example.com/article.md

# Directory
bin/sharemd docs/
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
- Google OAuth login + auto-registration
- User panel with API token and storage usage
- Per-user storage quotas
- Directory uploads with hierarchy
- Duplicate detection with overwrite prompt
- AI skill for agent integration
- Docker deployment with health checks

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port |
| `BASE_URL` | `http://localhost:3737` | Public URL for generated links |
| `DATA_DIR` | `./data` | Where files are stored on disk |
| `SITE_DOMAIN` | `sharemd` | Domain shown in header |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |

## Tests

```bash
npm test  # 37 tests
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
