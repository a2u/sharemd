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

### Google OAuth + User Panel
- `GET /login` → Google OAuth consent screen (no libraries, raw `https` module)
- `GET /auth/google/callback` → exchange code for token → get email → find or create user in `users.json`
- Auto-registration: new users get a generated API token and 20MB default limit
- `GET /panel` — terminal-styled page showing email, API token, storage bar (used / limit)
- `GET /logout` — clears session cookie
- `/login` redirects to `/panel` if already authenticated
- Sessions in-memory (Map), cookies HttpOnly + SameSite=Lax, 7-day expiry
- `dirSizeBytes()` recursively calculates user's disk usage on panel load

### Code review fixes
- `mkdirSync` moved out of auth middleware into write paths only
- `loadUsers()` logs JSON parse errors instead of silent failure
- `Buffer.from(token)` hoisted out of `findUserByToken` loop
- Bundle route returns 400 on invalid path instead of silent skip

## Tests
34 total (was 29). New tests:
- `/login` redirects to Google when not authenticated
- `/panel` redirects to `/login` when not authenticated
- `/logout` redirects and clears cookie
- Different tokens map to different user directories (multi-user isolation)
- User file listing only shows own files

## Files changed
- `server.js` — superadmin routing, users.json auth, raw mode, Google OAuth, panel, storage calc
- `tests/server.test.js` — 34 tests total, multi-user and auth route tests added
- `CLAUDE.md` — reflects Google OAuth, panel, web routes, new functions
- `docs/architecture.md` — Google OAuth, user panel, updated security model
- `.env.example` — added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `data/users.json` — created (not in git)

## What's not done yet
- Storage limit enforcement (field exists, calculated on panel, not blocked on upload)
- `/ai-skill` page — link on landing page, route returns 404
- Deployment (Dockerfile, CI/CD)
- Rate limiting
- File expiration / TTL
- Session persistence (currently in-memory, lost on restart)
