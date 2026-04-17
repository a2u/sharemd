# API Reference

Base URL: configured via `BASE_URL` env var (default `http://localhost:3737`).

## Authentication

Two mechanisms, all API endpoints accept either:

- **Bearer token** — `Authorization: Bearer <token>`. Token is in `data/users.json`; web users can copy their token from `/panel`. Used by the CLI and external agents.
- **Session cookie** — `sid=<signed>`. Set on Google OAuth login (`/auth/google/callback`). Used by the web UI (e.g. the delete button on file pages, the panel file list). HttpOnly, SameSite=Lax.

Token check is timing-safe. A request providing neither — or a bad token — returns `401`.

The URL prefix returned by upload endpoints depends on the user: superadmin (`id=1`) files live at the site root (`/hello.md`); other users' files live under `/<userId>/` (`/2/hello.md`).

---

## POST /api/upload

Upload a single markdown file.

**Request:**

```json
{
  "content": "# My Document\n\nHello world.",
  "filename": "my-doc.md",
  "overwrite": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | Raw markdown content |
| `filename` | string | no | Filename (default: `document.md`) |
| `overwrite` | boolean | no | Replace if file exists (default: `false`) |

**Response (200):**

```json
{
  "url": "http://localhost:3737/my-doc.md"
}
```

**Response (409 — file exists):**

```json
{
  "exists": true,
  "url": "http://localhost:3737/my-doc.md"
}
```

**Response (413 — storage limit exceeded):**

```json
{
  "error": "storage limit exceeded",
  "used": "19.8 MB",
  "limit": "20 MB"
}
```

---

## POST /api/upload-bundle

Upload multiple files (typically a directory). The CLI sends paths with the directory name preserved (e.g. `docs/guide.md`).

**Request:**

```json
{
  "files": [
    { "path": "docs/guide.md", "content": "# Guide\n..." },
    { "path": "docs/faq.md", "content": "# FAQ\n..." }
  ],
  "overwrite": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | array | yes | Array of `{path, content}` objects |
| `files[].path` | string | yes | Relative path (must include directory prefix) |
| `files[].content` | string | yes | Raw markdown content |
| `overwrite` | boolean | no | Replace existing files (default: `false`) |

Path validation: rejects absolute paths and `..` segments.

**Response (200):**

```json
{
  "url": "http://localhost:3737/docs"
}
```

**Response (409 — files exist):**

```json
{
  "exists": true,
  "files": ["docs/guide.md"],
  "url": "http://localhost:3737/docs"
}
```

---

## GET /api/files

List all uploaded files for the current user, flat array of paths sorted alphabetically.

**Request:** No body. Auth required.

**Response (200):**

```json
{
  "files": [
    "docs/faq.md",
    "docs/guide.md",
    "hello.md"
  ]
}
```

---

## DELETE /api/delete

Delete a file or directory.

**Request:**

```json
{
  "path": "docs"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File or directory path to delete |

When deleting a directory, all files inside are removed recursively. Accepts both Bearer token and session cookie — the in-browser delete button on rendered file pages uses the session cookie.

**Response (200):**

```json
{
  "deleted": 3,
  "path": "docs"
}
```

**Response (404):**

```json
{
  "error": "not found"
}
```

---

## GET /api/panel/files

Paginated + searchable file list for the logged-in user. Used by the `/panel` UI for client-side navigation without full page reload. **Session cookie auth only** (not Bearer) — this is a web-UI endpoint.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Case-insensitive substring match against each file's path |
| `page` | int | `1` | 1-based page number. Out-of-range values clamp to the last page |
| `limit` | int | `50` | Items per page. Clamped to `[1, 200]` |

**Response (200):**

```json
{
  "files": [
    { "path": "docs/guide.md", "size": 2048, "mtime": 1744722340000 },
    { "path": "hello.md",      "size": 128,  "mtime": 1744720000000 }
  ],
  "total": 2,
  "page": 1,
  "totalPages": 1,
  "limit": 50
}
```

Files are always sorted by `mtime` descending (newest first). The `/panel` UI knows its own user prefix from the initial SSR render, so the response carries only the paginated slice.

**Response (401):**

```json
{ "error": "not authenticated" }
```

---

## Public Routes (no auth)

These routes serve content to anyone with the URL.

| Route | Description |
|-------|-------------|
| `GET /` | Landing page |
| `GET /:file.md` | Superadmin (`id=1`) file, rendered |
| `GET /:file.md?raw` | Raw markdown as `text/plain` |
| `GET /:dir/` | Superadmin directory listing |
| `GET /:userId/:path.md` | Other users' file, rendered |
| `GET /:userId/:dir/` | Other users' directory listing |
| `GET /:userId` | Returns 404 (no public user-root listing) |
| `GET /health` | JSON `{status, uptime, version}` |
| `GET /install?token=<tok>` | Bash installer script with the given token baked in. Token must match `[A-Za-z0-9_]{8,128}`; otherwise an empty token is emitted |
| `GET /install/cli` | Raw `bin/sharemd` bash source (fetched by the installer) |
| `GET /login` | Redirects to Google OAuth (or `/panel` if already signed in) |
| `GET /login/denied` | 403 page for emails not in `ALLOWED_EMAILS` |
| `GET /panel` | Authenticated user panel (storage, file list with search/pagination, install one-liner). Redirects to `/login` if no session |
| `GET /logout` | Clears session cookie, redirects to `/` |
| `GET /ai-skill` | HTML page with Claude Code plugin-marketplace install + usage instructions |
| `GET /ai-skill?raw` | Raw `SKILL.md` content as `text/plain` — for manual install into `~/.claude/skills/` or for agents that don't use the marketplace |

---

## Error Responses

All errors return JSON:

```json
{
  "error": "description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (missing fields, invalid path) |
| 401 | Missing or invalid token / session |
| 404 | File/directory not found |
| 409 | File already exists (use `overwrite: true`) |
| 413 | Storage limit exceeded |
