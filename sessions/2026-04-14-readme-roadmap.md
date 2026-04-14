# 2026-04-14 — README Update + Roadmap

## What was done

Updated README.md to reflect current state of the project and added a public roadmap.

## Commits

| Hash | Message |
|------|---------|
| `bd30d22` | Update README: current features, Docker, roadmap |

## Changes

### README.md
- Added full feature list (OAuth, storage quotas, raw mode, theme toggle, Docker, AI skill)
- Added Docker quick start (`docker compose up -d`)
- Updated API examples to use `share.example.com` instead of `localhost`
- Added `SITE_DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to config table
- Added link to `docs/deployment.md`
- Added roadmap section with planned features

### Roadmap items added
- `/ai-skill` page
- Rate limiting
- File expiration / TTL
- Versioning (keep previous versions, `?v=1`)
- AI formatting (`format: true` flag)
- Webhooks on upload/delete
- CI/CD (GitHub Actions)
- Password-protected shares

### Files changed
1 file changed, 44 insertions, 23 deletions.

## Tests
37 total (unchanged). All passing.

## What's not done yet
- `/ai-skill` page
- Rate limiting
- File expiration / TTL
- CI/CD pipeline (GitHub Actions)
