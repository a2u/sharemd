# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

sharemd — a markdown file sharing service. Upload `.md` files via API or CLI, get back a URL with beautifully rendered HTML. Supports single files and directory bundles with hierarchy. AI-agent friendly.

## Commands

- `npm start` — run the server (port 3737)
- `npm run dev` — run with `--watch` for auto-reload
- `npm test` — run all tests (26 tests, `node:test`)
- `bin/sharemd file.md` — upload a single file via CLI
- `bin/sharemd directory/` — upload all `.md` files from a directory (preserves dir name)
- `bin/sharemd file.md -f` — force overwrite

## Project Structure

```
server.js          ← main server (Express, single file)
index.html         ← landing page template ({{SITE_DOMAIN}} placeholder)
bin/sharemd        ← CLI (pure bash + jq)
skill.md           ← AI skill definition
public/            ← static assets (favicon.ico)
tests/             ← tests (node:test, port 4747)
docs/              ← documentation
```

## Architecture

Single `server.js` file. Express + dotenv. See [docs/architecture.md](docs/architecture.md) for details.

**Storage:** plain `.md` files on disk at `data/{userId}/{path}`. No database. The filesystem is the database.

**URL scheme:** `/{userId}/{path}` — user ID is namespace (hardcoded to `1`, multi-user planned).
- `/{userId}/file.md` — renders markdown
- `/{userId}/dir/` — lists files in directory
- `/{userId}` — 404 (no public user listing)
- `/` — landing page (served from `index.html` template)

**Rendering:** server-side via `markdown-it` + `highlight.js`. `pageHtml()` returns complete HTML with inline CSS. Dark/light theme toggle (persisted in localStorage). Sticky header with clickable path breadcrumb.

**Auth:** single Bearer token via `crypto.timingSafeEqual`. Token set via `SHAREMD_TOKEN` env var. Loaded from `.env` via dotenv.

**CLI:** pure bash, requires `curl` + `jq`. Connection timeout 10s, error on unreachable server.

## API Endpoints

See [docs/api.md](docs/api.md) for full reference.

- `POST /api/upload` — single file (`{content, filename, overwrite?}`)
- `POST /api/upload-bundle` — directory (`{files: [{path, content}], overwrite?}`)
- `GET /api/files` — list all files (auth required)
- `DELETE /api/delete` — delete file or directory (`{path}`, auth required)

## Config

All via `.env` (loaded by dotenv). See `.env.example`:
- `PORT` (default 3737)
- `SHAREMD_TOKEN` — auth token
- `BASE_URL` — for generated URLs
- `DATA_DIR` — storage location (default `./data`)
- `SITE_DOMAIN` — domain shown in header breadcrumb and landing page

## Testing

Tests use `node:test` (built-in). Test file: `tests/server.test.js`. Server is started on port 4747 with a temp data dir that gets cleaned between tests.

## Key Functions

- `pageHtml(title, body, pathSegments)` — renders full HTML page with sticky header, theme toggle, footer
- `buildSegments(userId, filePath)` — builds clickable path breadcrumb from file path
- `landingHtml()` — reads `index.html` and substitutes `{{SITE_DOMAIN}}`
- `resolveFilePath(userId, filePath)` — resolves and validates paths (prevents traversal)

## Security

- Path traversal: `path.resolve()` + `startsWith()` check on all file ops
- Upload validation: rejects `..` segments and absolute paths
- XSS: `html: false` in markdown-it, `escapeHtml()` on all interpolated values including href attributes
- Only `.md` files served
- Timing-safe token comparison

## Documentation

- [Architecture](docs/architecture.md) — system design and decisions
- [API Reference](docs/api.md) — all endpoints with examples
- [CLI Reference](docs/cli.md) — command-line usage
