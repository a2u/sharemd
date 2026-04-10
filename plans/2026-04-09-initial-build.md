# 2026-04-09 — Initial Build of sharemd

## What was done

Built the entire sharemd service from scratch in a single session. The project went from an empty directory to a fully working markdown sharing service with API, CLI, tests, documentation, landing page, and a published GitHub repo.

## Architecture Decisions

- **Single server.js** — all server logic in one file (~480 lines). Express + dotenv.
- **Filesystem as database** — plain `.md` files stored at `data/{userId}/{path}`. No metadata files, no indexes. Intentionally simple.
- **User ID namespacing** — URLs are `/{userId}/{path}`. User ID hardcoded to `1` for now. When multi-user arrives, only the token-to-user mapping changes.
- **No public user listing** — `/{userId}` returns 404. Directory listings only at `/{userId}/{dir}/`.
- **Directory name preserved** — `sharemd docs/` stores files as `data/1/docs/guide.md`, not `data/1/guide.md`.
- **Server-side rendering only** — markdown-it + highlight.js, no client JS except theme toggle.
- **Pure bash CLI** — `bin/sharemd`, requires `curl` + `jq`, no python.

## Features Implemented

### Server (server.js)
- `POST /api/upload` — single file upload with duplicate detection (409) and overwrite flag
- `POST /api/upload-bundle` — directory upload preserving structure
- `GET /api/files` — list all files (auth required)
- `DELETE /api/delete` — delete file or directory recursively (auth required)
- Bearer token auth with `crypto.timingSafeEqual`
- Path traversal protection on all file operations
- Sticky header with clickable breadcrumb path: `share.nuit.sh / docs / guide.md`
- Dark/light theme toggle (button in header, persists in localStorage)
- `SITE_DOMAIN` env var for header and landing page
- Landing page at `/` — retro terminal aesthetic (index.html template)
- Favicon served from `public/`
- Footer: "shared via sharemd ❤️"

### CLI (bin/sharemd)
- `sharemd file.md` — upload single file, prints URL
- `sharemd dir/` — upload directory, preserves dir name
- `sharemd file.md -f` — force overwrite without asking
- Interactive y/n prompt on duplicate
- Connection error handling with 10s timeout
- Pure bash + jq, no python dependency

### Tests (tests/server.test.js)
- 26 tests using `node:test` (built-in)
- Covers: auth, upload, overwrite, bundle, path traversal, delete file, delete dir, list files, public viewing, directory listing, breadcrumb, 404 cases

### Documentation
- `docs/architecture.md` — full system design
- `docs/api.md` — all API endpoints with request/response examples
- `docs/cli.md` — CLI usage reference
- `CLAUDE.md` — agent guidance file
- `README.md` — repo readme with description
- `skill.md` — AI skill for agents
- `.env.example` — config template

### Landing Page (index.html)
- ASCII art logo
- Terminal/MS-DOS aesthetic
- `/login` and `/ai-skill` nav links
- `{{SITE_DOMAIN}}` placeholder substituted at runtime

## Code Reviews Done

Ran `/simplify` twice during the session:
1. **First review** — fixed: path traversal in loadPage, timing-safe token comparison, TOCTOU race condition, dead code in CLI, unused nanoid dependency, duplicated helpers
2. **Second review** — fixed: XSS in href attributes (escapeHtml on seg.href), duplicated segment-building logic (extracted buildSegments), removed CSS no-op (gap: 0), removed unnecessary comment

## Config

```
PORT=3737
SHAREMD_TOKEN=shmd_tk_9f4a2b7e1c8d3056
BASE_URL=http://localhost:3737
DATA_DIR=./data
SITE_DOMAIN=share.nuit.sh
```

## Repo

- GitHub: git@github.com:a2u/sharemd.git
- License: MIT (Vitalii Rudnykh)
- Topics: `markdown`, `self-hosted`, `markdown-sharing`, `cli`, `developer-tools`

## What's Not Done Yet

- `/login` and `/ai-skill` pages — links exist on landing page but routes return 404
- Multi-user support — user ID hardcoded to `1`, token management system not built
- Deployment — no Dockerfile, no CI/CD, no production config
- Rate limiting
- File size limits per user
- Expiration / TTL for shared files
