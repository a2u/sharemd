# sharemd — Share Markdown Files

Use this skill to share markdown content as a beautifully rendered web page. Returns a public URL that anyone can open in a browser.

## When to use

- When you need to share formatted text, documentation, reports, or notes
- When the user asks to "share", "publish", or "send" markdown content
- When you want to give someone a link to read a document

## How to use

### Share a single file

```bash
# From a file on disk
./sharemd path/to/file.md

# Programmatically via API
curl -s -X POST "${SHAREMD_URL:-http://localhost:3737}/api/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SHAREMD_TOKEN}" \
  -d "$(jq -Rs '{content: ., filename: "document.md"}' < file.md)"
```

### Share a directory of files

```bash
./sharemd path/to/directory/
```

### List uploaded files

```bash
curl -s "${SHAREMD_URL:-http://localhost:3737}/api/files" \
  -H "Authorization: Bearer ${SHAREMD_TOKEN}"
```

### Delete a file or directory

```bash
curl -s -X DELETE "${SHAREMD_URL:-http://localhost:3737}/api/delete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SHAREMD_TOKEN}" \
  -d '{"path": "old-report.md"}'
```

## Environment Variables

- `SHAREMD_URL` — Server base URL (default: `http://localhost:3737`)
- `SHAREMD_TOKEN` — Authentication token
