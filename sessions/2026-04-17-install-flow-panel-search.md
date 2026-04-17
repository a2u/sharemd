# 2026-04-17 — Install Flow, Delete Button, Panel Search

## What was done

Heavy feature day spanning deployment polish and product UX. Shipped GHCR multi-arch images, version reporting, a VPS install guide, an OAuth registration allowlist, a one-liner CLI install flow, a rendered-page delete button, and a searchable/paginated file panel. Fixed a security bug where `bin/sharemd` had a hardcoded superadmin token that silently uploaded under the wrong identity when `~/.sharemdrc` wasn't sourced. Closed the day with a `/simplify` cleanup pass that dropped a duplicate tree walk in `/panel` and removed a dead `userPrefix` API field.

## Commits

| Hash | Message |
|------|---------|
| `f9cf75d` | Add step-by-step VPS install guide to README |
| `0bed6ee` | Publish Docker image to GHCR and simplify VPS install |
| `d61e042` | Set version to 0.9.0 and surface it in /health and landing page |
| `e69d147` | Promote Updating section in README to top-level |
| `8495f43` | Gate OAuth registration with ALLOWED_EMAILS whitelist |
| `ed6dceb` | Restyle mailto link on denied page and isolate tests from local .env |
| `ab93db1` | Add one-liner CLI install flow via /install endpoint |
| `95957dc` | Quote install URL so zsh does not glob-expand the ? in the query |
| `93f999c` | Let owners delete their files from the rendered page |
| `ee04c65` | Collapse install command behind click-to-copy toggle on /panel |

Plus uncommitted work from today's session: panel search + pagination, token security fix, install UI polish, `/simplify` cleanup.

## Changes

### Deployment & release (committed)
- GitHub Actions workflow at `.github/workflows/docker.yml` builds multi-arch (`amd64` + `arm64`) images and pushes to `ghcr.io/a2u/sharemd` on every `main` push and tag
- `package.json` bumped to `0.9.0`; version exposed via `GET /health` and the landing page footer
- `docker-compose.prod.yml` added for pulling the prebuilt image
- README got a step-by-step VPS install guide and a promoted "Updating" section

### OAuth registration allowlist (committed)
- `ALLOWED_EMAILS` env var: `@domain.com` for whole-domain, full email for one user, comma-separated mix, empty = allow all
- `isEmailAllowed(email, list?)` helper added to `server.js`
- `GET /login/denied` returns `denied.html` with `ADMIN_EMAIL` mailto link
- Existing users in `users.json` keep access even if list tightens later
- Tests isolated from developer's local `.env`

### One-liner CLI install (committed + polished today)
- `GET /install?token=…` returns a bash installer that drops the CLI to `~/.local/bin/sharemd` and writes `~/.sharemdrc` with URL + token
- Token pattern validated (`[A-Za-z0-9_]{8,128}`); malformed input discarded
- `GET /install/cli` serves raw `bin/sharemd` content
- `buildInstallScript(token)` helper bakes the script with URL + token
- `/panel` shows a click-to-reveal install command that auto-copies to clipboard
- Polished to single-line no-wrap snippet with always-visible copy icon (inline SVG, not emoji, with `.copy-btn` hover/copied states)
- `.hint` color softened from `#666` → `#8a8a8a`

### Delete from rendered page (committed)
- Owner visiting their own file sees a delete button in the header
- Clicking opens a confirmation modal; `DELETE /api/delete` removes the file or directory
- Works via both Bearer token and session cookie auth (`/api/panel/files` is the only endpoint that is session-cookie-only)

### Panel search + pagination (uncommitted)
- `/panel` now includes a debounced search input (180ms) and prev/next pagination footer
- Default page size 50, capped at 200 via `?limit=`
- `GET /api/panel/files?q=&page=&limit=` endpoint (session-cookie auth): returns `{files, total, page, totalPages, limit}` with `files` as `[{path, size, mtime}]`
- New helpers in `server.js`: `PANEL_PAGE_SIZE = 50`, `listMdFilesWithStats(dir, baseDir)`, `filterAndPageFiles(files, query, page, limit)` (page clamp `Math.min(Math.max(1, page), totalPages)`)
- `panelHtml(email, token, usedBytes, limitMb, userId, initial)` signature updated to take `initial = {files, total, page, totalPages}` (SSR first page, JS takes over after)
- Inline JS: `renderList(data, query)`, `loadFiles(page, query)`, stale-response guard via `inflight` counter
- Sort: newest first by `mtime`

### Security fix: hardcoded token in CLI (uncommitted)
- `bin/sharemd` had `SHAREMD_TOKEN="${SHAREMD_TOKEN:-shmd_tk_9f4a2b7e1c8d3056}"` — that value matched the real superadmin in `data/users.json`, so a shell session without `~/.sharemdrc` sourced silently uploaded as superadmin
- Removed the fallback; CLI now exits 1 with a clear error message pointing at `~/.sharemdrc` or `/panel`
- `usage()` shows `SHAREMD_TOKEN` is REQUIRED
- Test fixture token rotated to `shmd_tk_test_superadmin_000000`
- **Action item for ops:** rotate the superadmin token on share.nuit.sh

### /simplify cleanup pass (uncommitted)
- `/panel` no longer walks user dir twice: `usedBytes` derived from `all.reduce((s,f)=>s+f.size,0)` after `listMdFilesWithStats()`, dropping one full tree walk per panel load
- Removed dead `userPrefix` field from `/api/panel/files` response (browser uses SSR-baked `USER_PREFIX`)
- Lifted `sidCookie()` test helper to module scope; replaced 7 inline `createSession + cookie: \`sid=${sid}\`` duplications

### Documentation (uncommitted)
- `docs/api.md` full rewrite: added `/api/panel/files`, session cookie auth note, public routes table, corrected superadmin URL examples
- `docs/architecture.md` full rewrite: panel with search/pagination, install flow, delete flow, allowlist, auth fallback, security table
- `docs/deployment.md`: GHCR image section, Caddy example, `docker compose pull` updating path
- `docs/cli.md`: `SHAREMD_TOKEN` marked required; default removed
- `README.md`: test count updated 37 → 63 (now 62 after test cleanup), features list refreshed
- `CLAUDE.md`: new endpoint listed, auth fallback documented, helpers (`filterAndPageFiles`, `listMdFilesWithStats`, `isEmailAllowed`, `buildInstallScript`) added, updated `pageHtml`/`panelHtml` signatures

### Files changed
Committed: 13 files, +877, −30.
Uncommitted: 9 files, +774, −99.

## Tests
62 total (was 37). Run: `npm test`
New test suites/tests:
- `isEmailAllowed`: 5 tests covering empty-list, exact, `@domain`, mixed, malformed
- `denied page`: 1 test (`GET /login/denied` returns 403 + terminal-style page)
- `install endpoints`: 4 tests (valid token baked in, empty token allowed, shell-injection rejected, `/install/cli` returns source)
- `delete button visibility`: 3 tests (owner sees it, anonymous hidden, non-owner hidden)
- `panel files API`: 7 tests (unauth 401, empty payload, mtime-desc sort, case-insensitive search, default limit 50 with page clamp to last page, custom limit clamp to 200, search+pagination compose)
- Existing `/panel` tests expanded: install toggle render, empty-state, files with links + sizes newest first, `/:userId` prefix for non-superadmin

## What's not done yet
- Commit uncommitted changes (panel search/pagination, token fix, install UI, /simplify cleanup, docs)
- Rotate the superadmin token on the live instance (security follow-up from hardcoded-token bug)
- `/ai-skill` page (carried)
- Rate limiting (carried)
- File expiration / TTL (carried)
- CI/CD pipeline beyond Docker builds — e.g., run tests in PR (carried, partially addressed by docker.yml)
- Versioning (keep previous versions, `?v=1`) (carried from roadmap)
- AI formatting (`format: true` flag) (carried)
- Webhooks on upload/delete (carried)
- Password-protected shares (carried)
