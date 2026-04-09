# CLI Reference

## Installation

The `sharemd` script is a standalone bash file in `bin/`. Copy it to your PATH or run it directly:

```bash
# From the repo
bin/sharemd file.md

# Or symlink to PATH
ln -s $(pwd)/bin/sharemd /usr/local/bin/sharemd
```

**Dependencies:** `curl`, `jq`

## Usage

```bash
sharemd <file.md|directory> [-f]
```

### Upload a single file

```bash
sharemd article.md
# → http://localhost:3737/1/article.md
```

### Upload a directory

```bash
sharemd docs/
# → 3 file(s) uploaded
# → http://localhost:3737/1/docs
```

The directory name is preserved. If `docs/` contains `guide.md` and `sub/faq.md`, they become:
- `/1/docs/guide.md`
- `/1/docs/sub/faq.md`

### Force overwrite

```bash
sharemd article.md -f
```

Without `-f`, if the file already exists, the CLI asks interactively:

```
Already exists: http://localhost:3737/1/article.md
Overwrite? [y/N]
```

### Connection errors

If the server is unreachable, the CLI exits with a clear error:

```
error: Cannot connect to http://localhost:3737
```

Timeout is 10 seconds.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SHAREMD_URL` | `http://localhost:3737` | Server base URL |
| `SHAREMD_TOKEN` | `shmd_tk_9f4a2b7e1c8d3056` | Auth token |

Example with a remote server:

```bash
export SHAREMD_URL=https://share.example.com
export SHAREMD_TOKEN=your-token-here
sharemd notes.md
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (file not found, upload failed, server unreachable) |
