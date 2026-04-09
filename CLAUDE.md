# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

sharemd — a markdown file sharing service. Upload `.md` files via API or CLI, get back a URL with beautifully rendered HTML. Supports single files and directory bundles with hierarchy.

## Commands

- `npm start` — run the server (port 3737)
- `npm run dev` — run with `--watch` for auto-reload
- `npm test` — run all tests
- `bin/sharemd file.md` — upload a single file via CLI
- `bin/sharemd directory/` — upload all `.md` files from a directory (preserves dir name)
- `bin/sharemd file.md -f` — force overwrite

## Architecture

Single `server.js` file. No framework beyond Express. See [docs/architecture.md](docs/architecture.md) for details.

**Storage:** plain `.md` files on disk at `data/{userId}/{path}`. No database, no metadata files. The filesystem is the database.

**URL scheme:** `/{userId}/{path}` — user ID is namespace (hardcoded to `1`, multi-user planned).
- `/{userId}/file.md` — renders markdown
- `/{userId}/dir/` — lists files in directory
- `/{userId}` — 404 (no public user listing)

**Rendering:** server-side only via `markdown-it` + `highlight.js`. `pageHtml()` returns complete HTML with inline CSS. No client-side JS.

**Auth:** single Bearer token via `crypto.timingSafeEqual`. Token set via `SHAREMD_TOKEN` env var.

**CLI:** pure bash, requires `curl` + `jq`.

## API Endpoints

See [docs/api.md](docs/api.md) for full reference.

- `POST /api/upload` — single file (`{content, filename, overwrite?}`)
- `POST /api/upload-bundle` — directory (`{files: [{path, content}], overwrite?}`)
- `GET /api/files` — list all files (auth required)
- `DELETE /api/delete` — delete file or directory (`{path}`, auth required)

## Config

All via environment variables (see `.env`):
- `PORT` (default 3737)
- `SHAREMD_TOKEN` — auth token
- `BASE_URL` — for generated URLs
- `DATA_DIR` — storage location (default `./data`)

## Testing

Tests use `node:test` (built-in). Test file: `tests/server.test.js`. Server is started on port 4747 with a temp data dir that gets cleaned between tests.

## Security

- Path traversal: `path.resolve()` + `startsWith()` check on all file ops
- Upload validation: rejects `..` segments and absolute paths
- XSS: `html: false` in markdown-it, `escapeHtml()` on all interpolated values
- Only `.md` files served

## Documentation

- [Architecture](docs/architecture.md) — system design and decisions
- [API Reference](docs/api.md) — all endpoints with examples
- [CLI Reference](docs/cli.md) — command-line usage
