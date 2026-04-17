---
name: sharemd
description: Share markdown content as a rendered web page via the sharemd CLI. Use when the user asks to share, publish, send, or get a link to markdown content, documentation, reports, or notes. Returns a public URL.
---

# sharemd

Share markdown files (or whole directories) as rendered web pages. The `sharemd` CLI uploads content to a sharemd server and prints a public URL to stdout.

## When to use

- User says "share this", "publish", "send a link", or asks for a URL to markdown content
- User wants to give someone else read access to a doc, report, or set of notes
- You produced a markdown report and want to surface it as a browsable page

## Prerequisite

The `sharemd` command must be on `PATH`, and `SHAREMD_TOKEN` + `SHAREMD_URL` must be configured in the environment (usually via `~/.sharemdrc`, written by the installer from the server's `/panel`).

If `sharemd` is not installed, tell the user: "The sharemd CLI is not installed. Visit your instance's `/panel` to get the one-liner install command." Do not attempt to install it yourself.

## How to use

### Share a single file

```bash
sharemd path/to/file.md
```

Prints one line to stdout: the URL. Capture it:

```bash
url=$(sharemd report.md)
```

### Share a whole directory

The directory name is preserved in the URL. Nested subdirectories work.

```bash
sharemd path/to/docs/
```

Prints `N file(s) uploaded` followed by the directory URL.

### Force overwrite

Without `-f`, if a file already exists on the server, the CLI asks interactively — which blocks in an agent context. Always pass `-f` when re-uploading programmatically:

```bash
sharemd file.md -f
```

## Output

- Success: exit 0, URL on stdout
- Server unreachable: exit 1, `error: Cannot connect to <URL>` on stderr
- Missing token: exit 1, clear message pointing at `/panel`

## Fallback: HTTP API

If the user explicitly asks for an API call (e.g. from a script that can't assume the CLI is installed), use:

```bash
curl -s -X POST "${SHAREMD_URL}/api/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SHAREMD_TOKEN}" \
  -d "$(jq -Rs '{content: ., filename: "document.md", overwrite: true}' < file.md)"
```

The response JSON has a `url` field. For directories, use `/api/upload-bundle` with `{files: [{path, content}, ...], overwrite: true}`.

## Notes

- Only `.md` files are accepted by the server.
- The URL is namespaced per user — you upload as whoever owns the token.
- To delete something previously shared, use `curl -X DELETE "${SHAREMD_URL}/api/delete" -H "Authorization: Bearer ${SHAREMD_TOKEN}" -d '{"path":"file.md"}'`.
