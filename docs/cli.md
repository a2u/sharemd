# CLI Reference

## Installation

### One-liner (recommended)

Log in to your instance, open `/panel`, and copy the install command. It looks like:

```bash
curl -fsSL "https://share.example.com/install?token=shmd_tk_xxxx" | bash
```

This will:

- Download the CLI to `~/.local/bin/sharemd`
- Write `~/.sharemdrc` with your token and server URL
- Source `~/.sharemdrc` from your `.bashrc` / `.zshrc`

After that, open a new terminal (or `source ~/.sharemdrc`) and run `sharemd file.md`.

**Dependencies:** `curl`, `jq` (`brew install jq` on macOS, `apt install jq` on Debian/Ubuntu).

Set `SHAREMD_INSTALL_DIR` before running if you want a different location:

```bash
curl -fsSL "https://share.example.com/install?token=..." | SHAREMD_INSTALL_DIR=$HOME/bin bash
```

### Manual

The `sharemd` script is a standalone bash file in `bin/`. Copy it to your PATH or run it directly:

```bash
# From the repo
bin/sharemd file.md

# Or symlink to PATH
ln -s $(pwd)/bin/sharemd /usr/local/bin/sharemd
```

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
| `SHAREMD_TOKEN` | — (required) | Auth token. The CLI refuses to run without it |

The CLI does **not** ship with a default token. If `SHAREMD_TOKEN` is unset, `sharemd` aborts with an error pointing you at `/panel`. This prevents silent uploads under the wrong identity when a shell session hasn't sourced `~/.sharemdrc` yet.

Example with a remote server:

```bash
export SHAREMD_URL=https://share.example.com
export SHAREMD_TOKEN=shmd_tk_your-token-here
sharemd notes.md
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (file not found, upload failed, server unreachable) |
