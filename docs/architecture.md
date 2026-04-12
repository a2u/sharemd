# Architecture

## Overview

sharemd is a single-process Node.js service that stores markdown files on the filesystem and renders them as HTML on demand. There is no database, no build step, and minimal client-side JavaScript (only theme toggle).

```
Client (browser/CLI/agent)
        │
        ▼
   Express server
    ├── Static assets (/public)    ← favicon
    ├── Landing page (/)           ← index.html template
    ├── API routes (/api/*)        ← auth required
    │   ├── POST /api/upload
    │   ├── POST /api/upload-bundle
    │   ├── GET  /api/files
    │   └── DELETE /api/delete
    │
    └── Public routes (/:userId/*)  ← no auth
        ├── /:userId/:dir/          ← directory listing
        └── /:userId/:path.md       ← rendered markdown
```

## Storage

Files are stored as plain `.md` files on disk, organized by user ID:

```
data/
  1/                    ← user ID (hardcoded for now)
    hello.md            ← single file upload
    docs/               ← directory upload (name preserved)
      guide.md
      api-ref.md
      advanced/
        plugins.md
```

No metadata files, no index, no database. The filesystem _is_ the database. This means:
- Backups are just `cp -r data/`
- Debugging is just `cat data/1/file.md`
- Migration is just moving files around

## Configuration

All config via `.env` file, loaded by `dotenv` at startup:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port |
| `BASE_URL` | `http://localhost:3737` | Used in generated URLs |
| `DATA_DIR` | `./data` | File storage location |
| `SITE_DOMAIN` | `sharemd` | Domain shown in header and landing page |

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

## Authentication

Two auth methods:

**API auth (Bearer token):** Tokens are looked up in `data/users.json`. Each token maps to a user ID, which determines the storage directory (`data/{userId}/`). Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

**Web auth (Google OAuth):** `GET /login` → Google OAuth consent → callback → find or create user in `users.json` → signed session cookie. No external auth libraries — raw Node.js `https` module makes 3 HTTP calls to Google APIs (auth redirect, token exchange, userinfo). Sessions are HMAC-signed cookies (no server-side storage, survive restarts). Signing secret auto-generated in `data/.session-secret`. Cookies are HttpOnly with SameSite=Lax, 7-day expiry baked into signed payload.

New users are auto-registered on first Google login — a new entry is added to `users.json` with a generated API token and default 20MB storage limit.

User ID 1 is the superadmin — their files are served at root-level URLs (`/file.md` instead of `/1/file.md`). Other users' files are served at `/{userId}/file.md`.

## User Panel

`GET /panel` shows the logged-in user's email, API token, and storage usage (used / limit with progress bar). Storage is calculated on each page load by recursively walking `data/{userId}/`. Terminal aesthetic matching the landing page.

## Rendering Pipeline

```
.md file on disk
    │
    ▼
markdown-it (parser)
    ├── highlight.js (code blocks)
    └── markdown-it-anchor (heading anchors)
    │
    ▼
HTML string
    │
    ▼
pageHtml() template
    ├── Sticky header with clickable path breadcrumb (buildSegments)
    ├── Inline CSS (light/dark theme via CSS variables)
    ├── Theme toggle button (persists in localStorage)
    ├── highlight.js CDN stylesheets (switched by theme)
    └── Footer with GitHub link
    │
    ▼
Complete HTML response
```

Rendering is fully server-side. Every page view reads the file from disk and renders it fresh. There is no caching layer — for a personal sharing tool, filesystem reads are fast enough.

## URL Scheme

- `/` — landing page (from `index.html` template, `{{SITE_DOMAIN}}` substituted)
- `/{file.md}` — superadmin (id=1) files, no prefix
- `/{file.md}?raw` — raw markdown content as `text/plain`
- `/{dir}/` — superadmin directory listing
- `/{userId}/{file.md}` — other users' files
- `/{userId}/{dir}/` — other users' directory listings
- `/{userId}` — returns 404 (no public listing of all files)

The user ID in the URL acts as a namespace. Superadmin (id=1) is special — their files are served directly from root. Users cannot see each other's files.

## Theme System

Dark/light theme with three layers:
1. **Default:** follows system `prefers-color-scheme`
2. **Manual override:** toggle button in top-right of header
3. **Persistence:** choice saved in `localStorage`, applied on page load

CSS uses `:root:not([data-theme])` for the media query so that manual `data-theme` attribute always wins over system preference.

highlight.js stylesheets are toggled by disabling/enabling the `<link>` elements.

## Landing Page

Served from `index.html` in project root. Contains `{{SITE_DOMAIN}}` placeholders substituted at runtime. Styled as a retro terminal (Courier, black background, blinking cursor). Not in `public/` because it requires server-side templating.

## Security Model

| Layer | Protection |
|-------|-----------|
| API auth | Bearer token from `data/users.json`, timing-safe comparison |
| Web auth | Google OAuth, HttpOnly session cookies, SameSite=Lax |
| User isolation | Each user's files in separate `data/{userId}/` directory |
| Path traversal | `path.resolve()` + startsWith check on all file operations |
| Upload validation | Rejects `..` segments, absolute paths |
| XSS | `html: false` in markdown-it, `escapeHtml()` on all interpolated values including href |
| File types | Only `.md` files are served/rendered |

## Concurrency

The server uses synchronous filesystem I/O. This is intentional for a low-traffic personal tool — it keeps the code simple and avoids race conditions on file writes. If the service needs to handle concurrent load, the file operations should be converted to async with proper locking.
