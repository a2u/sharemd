# API Reference

All API endpoints require authentication via `Authorization: Bearer <token>` header.

Base URL: configured via `BASE_URL` env var (default `http://localhost:3737`).

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
  "url": "http://localhost:3737/1/my-doc.md"
}
```

**Response (409 — file exists):**

```json
{
  "exists": true,
  "url": "http://localhost:3737/1/my-doc.md"
}
```

---

## POST /api/upload-bundle

Upload multiple files (typically a directory).

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
  "url": "http://localhost:3737/1/docs"
}
```

**Response (409 — files exist):**

```json
{
  "exists": true,
  "files": ["docs/guide.md"],
  "url": "http://localhost:3737/1/docs"
}
```

---

## GET /api/files

List all uploaded files for the current user.

**Request:** No body. Auth header only.

**Response (200):**

```json
{
  "files": [
    "hello.md",
    "docs/guide.md",
    "docs/faq.md"
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

When deleting a directory, all files inside are removed recursively.

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

## Public Routes (no auth)

These routes are accessed by anyone with the URL.

| Route | Description |
|-------|-------------|
| `GET /:userId/:file.md` | Renders markdown as styled HTML |
| `GET /:userId/:dir/` | Lists `.md` files in the directory |
| `GET /:userId` | Returns 404 (no public user listing) |

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
| 401 | Missing or invalid token |
| 404 | File/directory not found |
| 409 | File already exists (use `overwrite: true`) |
