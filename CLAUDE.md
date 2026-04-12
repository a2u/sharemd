# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

sharemd — a markdown file sharing service. Upload `.md` files via API or CLI, get back a URL with beautifully rendered HTML. Supports single files and directory bundles with hierarchy. AI-agent friendly.

## Commands

- `npm start` — run the server (port 3737)
- `npm run dev` — run with `--watch` for auto-reload
- `npm test` — run all tests (36 tests, `node:test`)
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
data/users.json    ← user registry (tokens, limits) — not in git
```

## Architecture

Single `server.js` file. Express + dotenv. See [docs/architecture.md](docs/architecture.md) for details.

**Storage:** plain `.md` files on disk at `data/{userId}/{path}`. No database. The filesystem is the database.

**URL scheme:** `/{userId}/{path}` — user ID is namespace. Superadmin (id=1) gets short URLs without ID prefix.
- `/file.md` — superadmin's file (no `/1/` prefix)
- `/file.md?raw` — raw markdown content as text/plain
- `/{userId}/file.md` — other users' files
- `/{userId}/dir/` — lists files in directory
- `/{userId}` — 404 (no public user listing)
- `/` — landing page (served from `index.html` template)

**Rendering:** server-side via `markdown-it` + `highlight.js`. `pageHtml()` returns complete HTML with inline CSS. Dark/light theme toggle (persisted in localStorage). Sticky header with clickable path breadcrumb.

**Auth:** Bearer token looked up in `data/users.json`. Each token maps to a user ID. File is re-read on every auth request (no restart needed when adding users). Timing-safe comparison via `crypto.timingSafeEqual`.

**Google OAuth:** `GET /login` → Google → `GET /auth/google/callback` → find or create user in `users.json` → signed session cookie → `/panel`. No external auth libraries — raw `https` module calls to Google APIs. Sessions are HMAC-signed cookies (survive server restarts, no server-side storage). Secret auto-generated in `data/.session-secret`.

**CLI:** pure bash, requires `curl` + `jq`. Connection timeout 10s, error on unreachable server.

## API Endpoints

See [docs/api.md](docs/api.md) for full reference.

- `POST /api/upload` — single file (`{content, filename, overwrite?}`)
- `POST /api/upload-bundle` — directory (`{files: [{path, content}], overwrite?}`)
- `GET /api/files` — list all files (auth required)
- `DELETE /api/delete` — delete file or directory (`{path}`, auth required)

All API endpoints determine the target user from the token in `data/users.json`.

## Web Routes

- `GET /login` — redirects to Google OAuth (or `/panel` if already logged in)
- `GET /auth/google/callback` — OAuth callback, creates session
- `GET /panel` — user panel (email, token, storage usage)
- `GET /logout` — clears session, redirects to `/`

## Config

Server config via `.env` (loaded by dotenv). See `.env.example`:
- `PORT` (default 3737)
- `BASE_URL` — for generated URLs
- `DATA_DIR` — storage location (default `./data`)
- `SITE_DOMAIN` — domain shown in header breadcrumb and landing page
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret

User config via `data/users.json`:
- `id` — numeric user ID (1 = superadmin)
- `email` — user email
- `token` — Bearer token for API auth
- `registeredAt` — ISO date
- `storageLimitMb` — disk quota in megabytes (enforced on upload, 413 if exceeded)

## Testing

Tests use `node:test` (built-in). Test file: `tests/server.test.js`. Server is started on port 4747 with a temp data dir that gets cleaned between tests. Tests create their own `users.json`.

## Key Functions

- `pageHtml(title, body, pathSegments, rawUrl)` — renders full HTML page with sticky header, theme toggle, raw link, footer
- `panelHtml(email, token, usedBytes, limitMb)` — user panel page with storage bar
- `buildSegments(userId, filePath)` — builds clickable path breadcrumb from file path
- `handlePath(req, res, userId, filePath)` — shared file/directory rendering logic
- `landingHtml()` — reads `index.html` and substitutes `{{SITE_DOMAIN}}`
- `resolveFilePath(userId, filePath)` — resolves and validates paths (prevents traversal)
- `loadUsers()` — reads `data/users.json`
- `findUserByToken(token)` — looks up user by Bearer token (timing-safe)
- `dirSizeBytes(dir)` — recursively calculates directory size
- `getSession(req)` — reads session from cookie

## Security

- Path traversal: `path.resolve()` + `startsWith()` check on all file ops
- Upload validation: rejects `..` segments and absolute paths
- XSS: `html: false` in markdown-it, `escapeHtml()` on all interpolated values including href attributes
- Only `.md` files served
- Timing-safe token comparison against `data/users.json`
- User isolation: each user's files in separate `data/{userId}/` directory
- Session cookies: HttpOnly, SameSite=Lax

## Documentation

- [Architecture](docs/architecture.md) — system design and decisions
- [API Reference](docs/api.md) — all endpoints with examples
- [CLI Reference](docs/cli.md) — command-line usage
