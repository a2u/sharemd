# Architecture

## Overview

sharemd is a single-process Node.js service that stores markdown files on the filesystem and renders them as HTML on demand. There is no database, no build step, and no client-side JavaScript.

```
Client (browser/CLI/agent)
        │
        ▼
   Express server
    ├── API routes (/api/*)     ← auth required
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
    docs/               ← directory upload
      guide.md
      api-ref.md
      advanced/
        plugins.md
```

No metadata files, no index, no database. The filesystem _is_ the database. This means:
- Backups are just `cp -r data/`
- Debugging is just `cat data/1/file.md`
- Migration is just moving files around

## Authentication

Single bearer token checked via `crypto.timingSafeEqual` to prevent timing attacks. Token is configured via `SHAREMD_TOKEN` env var.

The token maps to a hardcoded user ID (`1`). When multi-user support is added, the token-to-user mapping will be the only thing that changes — the rest of the architecture stays the same since everything is already namespaced by user ID.

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
    ├── Inline CSS (light/dark theme via prefers-color-scheme)
    ├── highlight.js CDN stylesheets
    └── Optional breadcrumb navigation
    │
    ▼
Complete HTML response (no JS, no hydration)
```

Rendering is fully server-side. Every page view reads the file from disk and renders it fresh. There is no caching layer — for a personal sharing tool, filesystem reads are fast enough.

## URL Scheme

```
/{userId}/{path}
```

- `/{userId}/{file.md}` — renders a single markdown file
- `/{userId}/{dir}/` — lists all `.md` files in that directory
- `/{userId}` — returns 404 (no public listing of all files)

The user ID in the URL acts as a namespace. Users cannot see each other's files.

## Security Model

| Layer | Protection |
|-------|-----------|
| Auth | Bearer token, timing-safe comparison |
| Path traversal | `path.resolve()` + startsWith check on all file operations |
| Upload validation | Rejects `..` segments, absolute paths |
| XSS | `html: false` in markdown-it, `escapeHtml()` on all interpolated values |
| File types | Only `.md` files are served/rendered |

## Concurrency

The server uses synchronous filesystem I/O. This is intentional for a low-traffic personal tool — it keeps the code simple and avoids race conditions on file writes. If the service needs to handle concurrent load, the file operations should be converted to async with proper locking.
