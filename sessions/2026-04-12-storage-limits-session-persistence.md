# 2026-04-12 — Storage Limit Enforcement + Session Persistence

## What was done

Two reliability features: storage quota enforcement on uploads, and signed cookie sessions that survive server restarts.

## Changes

### Storage limit enforcement
- `checkStorageLimit(user, newBytes)` — calculates current usage via `dirSizeBytes()`, compares with `storageLimitMb * 1024 * 1024`, returns error object if exceeded
- Checked on both `POST /api/upload` and `POST /api/upload-bundle` before writing files
- Returns 413 with `{error: "storage limit exceeded", used: "1.2 MB", limit: "20 MB"}`
- Fixed falsy-zero bug: `storageLimitMb || 20` was treating `0` as falsy, replaced with `!= null` check

### Signed cookie sessions
- Replaced in-memory `Map` with HMAC-signed cookies
- Cookie payload: `{userId, email, exp}` → base64url-encoded → signed with SHA-256 HMAC
- Secret auto-generated on first run, stored in `data/.session-secret`
- Signature verified with `crypto.timingSafeEqual` on every request
- 7-day expiry baked into signed payload (checked server-side)
- No server-side session storage — survives restarts, zero memory overhead
- Logout just clears the cookie (client-side), no server-side invalidation

## Tests
36 total (was 33). New tests:
- Rejects upload when storage limit exceeded (413)
- Rejects bundle upload when storage limit exceeded (413)
- Allows upload within storage limit

## What's not done yet
- `/ai-skill` page
- Deployment (Dockerfile, CI/CD)
- Rate limiting
- File expiration / TTL
