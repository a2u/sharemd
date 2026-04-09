<p align="center">
  <img src="logo.png" alt="sharemd" width="500">
</p>

<p align="center">
Lightweight markdown sharing service. Upload `.md` files via API or CLI, get a clean URL with beautifully rendered content. Supports single files and directory bundles with hierarchy. Dark/light theme, syntax highlighting, token auth. Self-hosted, no database — just Node.js and the filesystem.
</p>

## Quick Start

```bash
npm install
npm start
```

Server runs at `http://localhost:3737`.

## Share files

```bash
# Single file
bin/sharemd article.md
# → http://localhost:3737/1/article.md

# Directory
bin/sharemd docs/
# → http://localhost:3737/1/docs
```

Open the URL in a browser to see rendered markdown with syntax highlighting and dark/light theme support.

## API

All API endpoints require `Authorization: Bearer <token>` header.

```bash
# Upload
curl -X POST http://localhost:3737/api/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHAREMD_TOKEN" \
  -d '{"content": "# Hello\nWorld", "filename": "hello.md"}'

# List files
curl http://localhost:3737/api/files \
  -H "Authorization: Bearer $SHAREMD_TOKEN"

# Delete
curl -X DELETE http://localhost:3737/api/delete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHAREMD_TOKEN" \
  -d '{"path": "hello.md"}'
```

See [docs/api.md](docs/api.md) for the full API reference.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port |
| `SHAREMD_TOKEN` | `shmd_tk_...` | Auth token for uploads/deletes |
| `BASE_URL` | `http://localhost:3737` | Public URL for generated links |
| `DATA_DIR` | `./data` | Where files are stored on disk |

## CLI

Requires `curl` and `jq`.

```bash
bin/sharemd file.md           # upload single file
bin/sharemd directory/        # upload directory
bin/sharemd file.md -f        # force overwrite
```

See [docs/cli.md](docs/cli.md) for full CLI reference.

## Tests

```bash
npm test
```

## Documentation

- [Architecture](docs/architecture.md) — how it works under the hood
- [API Reference](docs/api.md) — all endpoints with examples
- [CLI Reference](docs/cli.md) — command-line usage

## License

[MIT](LICENSE) — Vitalii Rudnykh
