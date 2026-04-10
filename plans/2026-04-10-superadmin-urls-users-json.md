# 2026-04-10 — Superadmin URLs, Raw Mode, Users.json Auth

## What was done

Two major changes: reworked URL scheme so superadmin (id=1) gets clean URLs without `/1/` prefix, and moved auth from hardcoded env var token to `data/users.json` file with multi-user support ready.

## Changes

### Superadmin URLs
- User id=1 (superadmin) files served at `/article.md` instead of `/1/article.md`
- `/1/path` automatically redirects 302 → `/path` for backwards compat
- Other users (future) keep `/{userId}/path` scheme
- `urlPrefix(userId)` returns `""` for superadmin, `"/{userId}"` for others
- `publicUrl(userId, filePath)` generates correct URLs per user
- `buildSegments()` produces breadcrumbs without `/1/` for superadmin
- All API responses return clean URLs for superadmin

### Raw markdown mode
- `?raw` query param on any `.md` URL returns raw content as `text/plain`
- Small `raw` button in header (next to theme toggle), styled as a pill link
- Works for both superadmin and regular user URLs

### Auth via users.json
- Tokens no longer from `SHAREMD_TOKEN` env var
- `data/users.json` stores user registry:
  ```json
  [{"id": 1, "email": "...", "token": "shmd_tk_...", "registeredAt": "...", "storageLimitMb": 20}]
  ```
- `loadUsers()` reads file on every auth request — no restart needed when adding users
- `findUserByToken()` iterates all users with `crypto.timingSafeEqual`
- Auth middleware sets `req.user`, all API routes use `req.user.id` for file operations
- User directory created automatically on first authenticated request
- `SHAREMD_TOKEN` removed from `.env.example` and server config

### Code refactoring
- Extracted `handlePath(req, res, userId, filePath)` — shared logic for file/directory rendering used by both `/:userId/:filePath` and `/:filePath` catch-all routes
- Extracted `urlPrefix()` and `publicUrl()` helpers
- Route structure: API routes → landing → numeric userId routes → superadmin catch-all

## Tests

29 tests total (was 26). New tests:
- `/1/path` redirects to `/path`
- Renders file at `/path` directly (no `/1/`)
- Breadcrumb links have no `/1/` prefix
- `?raw` returns `text/plain` markdown content
- Rendered page contains `raw` link
- Tests create their own `users.json` in test data dir

## Files changed
- `server.js` — major refactor (superadmin routing, users.json auth, raw mode, handlePath extraction)
- `tests/server.test.js` — updated for new URL scheme, users.json, 3 new tests
- `CLAUDE.md` — full rewrite reflecting current state
- `docs/architecture.md` — new User Management section, updated Auth/URL/Security sections
- `.env.example` — removed `SHAREMD_TOKEN`
- `data/users.json` — created (not in git)

## What's not done yet
- Storage limit enforcement (`storageLimitMb` in users.json exists but not checked)
- `/login` and `/ai-skill` pages — links on landing page, routes return 404
- User registration flow
- Deployment (Dockerfile, CI/CD)
- Rate limiting
- File expiration / TTL
