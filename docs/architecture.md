# Architecture

## Overview

sharemd is a single-process Node.js service that stores markdown files on the filesystem and renders them as HTML on demand. There is no database, no build step, and the client-side JS is limited to a handful of inline snippets (theme toggle, copy-to-clipboard on the panel, delete-modal confirmation, panel file-list search/pagination).

```
Client (browser / CLI / agent)
        │
        ▼
   Express server
    ├── Static assets (/public)          ← favicon
    ├── Landing page (/)                 ← index.html template
    ├── Health probe (/health)           ← {status, uptime, version}
    ├── Installer endpoints              ← bash one-liner for CLI
    │   ├── GET /install?token=<tok>
    │   └── GET /install/cli
    ├── AI skill page (/ai-skill)        ← Claude Code plugin install docs
    ├── Auth flow (Google OAuth)
    │   ├── GET /login
    │   ├── GET /login/denied            ← ALLOWED_EMAILS reject page
    │   ├── GET /auth/google/callback
    │   ├── GET /panel                   ← storage + file list + install
    │   └── GET /logout
    ├── API routes (/api/*)              ← Bearer OR session cookie
    │   ├── POST   /api/upload
    │   ├── POST   /api/upload-bundle
    │   ├── GET    /api/files
    │   ├── GET    /api/panel/files      ← paginated + search (session only)
    │   └── DELETE /api/delete
    │
    └── Public routes                    ← no auth
        ├── /                            ← superadmin file
        ├── /:dir/
        ├── /:userId/:path
        └── /:userId/:dir/
```

## Storage

Files are stored as plain `.md` files on disk, organized by user ID:

```
data/
  users.json           ← user registry (tokens, emails, limits)
  .session-secret      ← auto-generated HMAC key for cookies
  1/                   ← superadmin (id=1)
    hello.md
    docs/
      guide.md
      advanced/
        plugins.md
  2/                   ← second user
    notes.md
```

No metadata files, no index, no database. The filesystem _is_ the database:

- Backups are `cp -r data/`
- Debugging is `cat data/1/file.md`
- Migration is moving files around

## Configuration

All config via `.env` file, loaded by `dotenv` at startup:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port |
| `BASE_URL` | `http://localhost:3737` | Used in generated URLs and the install script |
| `DATA_DIR` | `./data` | File storage location |
| `SITE_DOMAIN` | `sharemd` | Domain shown in header and landing page |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `ALLOWED_EMAILS` | — | Registration allowlist (`@domain.com` or exact email, comma-separated). Empty = allow all |
| `ADMIN_EMAIL` | — | Admin contact shown on `/login/denied` |

## User Management

Users are stored in `data/users.json`:

```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "token": "shmd_tk_...",
    "registeredAt": "2026-04-09T00:00:00.000Z",
    "storageLimitMb": 20
  }
]
```

The file is re-read on every authenticated request — no server restart needed when adding or removing users.

User ID 1 is the superadmin — their files are served at root-level URLs (`/file.md` instead of `/1/file.md`). Other users' files are served at `/{userId}/file.md`.

## Authentication

Two credentials, either works on every authenticated endpoint (except `/api/panel/files`, which is session-only since it's a web-UI endpoint):

**Bearer token.** Tokens are looked up in `data/users.json`. Each token maps to a user ID, which determines the storage directory (`data/{userId}/`). Comparison uses `crypto.timingSafeEqual`. Primary path for the CLI and external agents.

**Session cookie.** `GET /login` → Google OAuth consent → `GET /auth/google/callback` → find-or-create user in `users.json` → HMAC-signed cookie `sid=…`. No external auth libraries — raw Node.js `https` module makes two HTTPS calls to Google (token exchange, userinfo). Cookies are HttpOnly, `SameSite=Lax`, 7-day expiry baked into the signed payload. The HMAC secret is auto-generated in `data/.session-secret` and persists across restarts, so cookies survive a redeploy.

New users are auto-registered on first Google login — a new entry is added to `users.json` with a generated token and the default 20 MB storage limit, provided the email passes the `ALLOWED_EMAILS` filter.

### Registration allowlist

If `ALLOWED_EMAILS` is set, new users are rejected unless their email matches one of the comma-separated entries. Each entry is either a full email (`alice@example.com`) or a domain (`@example.com`). Existing users in `users.json` are never retroactively kicked out — the list is only applied during OAuth registration. Rejected logins land on `/login/denied` showing a terminal-styled 403 with `ADMIN_EMAIL` as the contact link.

## User Panel (`/panel`)

Terminal-styled page (matches the landing page aesthetic) showing:

- **email** — the current user's email
- **storage** — used / limit with a progress bar (recalculated on each load by walking `data/{userId}/`)
- **files (N)** — scrollable list of the user's `.md` files with path, size and click-through link. Sorted by mtime descending (newest first). First 50 rendered inline by SSR
- **search input** — live client-side filter; debounced 180 ms, calls `/api/panel/files?q=…`, replaces the list without a page reload
- **pagination** — hidden when total ≤ limit. Otherwise shows `page / totalPages` with prev/next buttons that re-fetch via the same API endpoint
- **install cli** — click-to-reveal toggle. When opened, the `curl … | bash` one-liner (with the user's token pre-filled) is shown next to a copy icon. Clicking the icon copies to clipboard (with an `execCommand` textarea fallback for non-HTTPS contexts). Token is never shown as a standalone field

The client uses a monotonically increasing `inflight` counter to discard stale responses (important for fast-typed search input).

## CLI Installer

`GET /install?token=<tok>` returns a bash script that:

1. Downloads the CLI from `${BASE_URL}/install/cli` into `${SHAREMD_INSTALL_DIR:-$HOME/.local/bin}/sharemd` and `chmod +x`
2. Writes `~/.sharemdrc` with `SHAREMD_URL` and `SHAREMD_TOKEN` exports
3. Appends a `source ~/.sharemdrc` line to `~/.bashrc` and `~/.zshrc` if not already present

`GET /install/cli` serves the raw `bin/sharemd` bash source.

The token is validated against `/^[A-Za-z0-9_]{8,128}$/` before being interpolated into the script — any malformed or missing token produces a script that exits with an error, so shell-injection attempts cannot escape the quoted variable.

## AI Skill Distribution

The repo doubles as a Claude Code plugin marketplace. A single skill — `sharemd` — wraps the CLI so agents can share markdown files in response to natural-language prompts ("share this as a page").

```
.claude-plugin/
  marketplace.json              ← catalog (one plugin: "sharemd")
plugins/sharemd/
  .claude-plugin/plugin.json    ← plugin manifest (version, repo, license)
  skills/sharemd/SKILL.md       ← YAML frontmatter + agent instructions
```

Users install with two slash commands inside Claude Code:

```
/plugin marketplace add a2u/sharemd
/plugin install sharemd@sharemd
```

The marketplace is the GitHub repo itself — `/plugin marketplace update sharemd` pulls new versions. The skill has no token baked in; it calls the `sharemd` CLI, which reads auth from `~/.sharemdrc`. That means `SKILL.md` can be shared freely without leaking credentials.

`GET /ai-skill` serves an HTML page documenting the install + usage flow. `GET /ai-skill?raw` returns the `SKILL.md` body as `text/plain` for agents that don't use the marketplace (Cursor, Codex, manual `~/.claude/skills/` drops, etc.).

## Delete Flow

Rendered `.md` pages show a `delete` button next to `raw` when the current session belongs to the file's owner (`Number(session.userId) === Number(fileUserId)`). Clicking opens a modal with the file path and a confirmation button. The confirmation issues `DELETE /api/delete` using the session cookie (`credentials: "same-origin"`), then redirects to the parent directory (`/parent/` or `/` for root-level files).

The button is not rendered for anonymous viewers or users viewing someone else's files — but the API still enforces ownership via the `users.json` lookup, so hiding the button is UX only, not a security boundary.

## Rendering Pipeline

```
.md file on disk
    │
    ▼
markdown-it (parser)
    ├── highlight.js         ← code blocks
    └── markdown-it-anchor   ← heading anchors
    │
    ▼
HTML string
    │
    ▼
pageHtml() template
    ├── Sticky header (breadcrumb via buildSegments)
    ├── Inline CSS (light/dark via CSS variables)
    ├── Theme toggle (persists in localStorage)
    ├── [raw] and conditional [delete] buttons
    ├── Delete-confirm modal + <script> (only when canDelete)
    ├── highlight.js CDN stylesheets (switched by theme)
    └── Footer with GitHub link
    │
    ▼
Complete HTML response
```

Every page view reads the file from disk and renders it fresh. No caching layer — for a personal sharing tool, filesystem reads are fast enough.

## URL Scheme

- `/` — landing page (from `index.html` template, `{{SITE_DOMAIN}}` and `{{VERSION}}` substituted)
- `/{file.md}` — superadmin (id=1) files, no prefix
- `/{file.md}?raw` — raw markdown content as `text/plain`
- `/{dir}/` — superadmin directory listing
- `/{userId}/{file.md}` — other users' files
- `/{userId}/{dir}/` — other users' directory listings
- `/{userId}` — returns 404 (no public listing of all files)

The user ID acts as a namespace. Users cannot see each other's files.

## Theme System

Dark/light with three layers:

1. **Default:** follows system `prefers-color-scheme`
2. **Manual override:** toggle button in top-right of header
3. **Persistence:** choice saved in `localStorage`, applied on page load

CSS uses `:root:not([data-theme])` for the media query so that a manual `data-theme` attribute always wins over system preference. highlight.js light/dark stylesheets are toggled by disabling/enabling the `<link>` elements.

## Landing Page

Served from `index.html` in the project root. Contains `{{SITE_DOMAIN}}` and `{{VERSION}}` placeholders substituted at runtime. Styled as a retro terminal (Courier, black background, blinking cursor). The version in the footer is read from `package.json` at startup and exposed on `/health`.

## Security Model

| Layer | Protection |
|-------|-----------|
| API auth | Bearer token from `data/users.json`, timing-safe comparison |
| Web auth | Google OAuth, HttpOnly session cookies, SameSite=Lax |
| User isolation | Each user's files in a separate `data/{userId}/` directory |
| Path traversal | `path.resolve()` + startsWith check on all file operations |
| Upload validation | Rejects `..` segments, absolute paths |
| XSS | `html: false` in markdown-it, `escapeHtml()` on all interpolated values including href |
| File types | Only `.md` files are served/rendered |
| CSRF | `SameSite=Lax` on session cookie prevents cross-site POST/DELETE |
| Install endpoint | Token is regex-validated before being baked into the returned bash |
| Registration control | Optional `ALLOWED_EMAILS` domain/exact-email allowlist |

## Concurrency

The server uses synchronous filesystem I/O. This is intentional for a low-traffic personal tool — it keeps the code simple and avoids race conditions on file writes. If the service needs to handle concurrent load, the file operations should be converted to async with proper locking.
