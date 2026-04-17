require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const MarkdownIt = require("markdown-it");
const hljs = require("highlight.js");
const anchor = require("markdown-it-anchor");
const { version: VERSION } = require("./package.json");

// --- Config ---

const PORT = process.env.PORT || 3737;
const SUPERADMIN_ID = 1;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(
  /\/$/,
  ""
);
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const SITE_DOMAIN = process.env.SITE_DOMAIN || "sharemd";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isEmailAllowed(email, allowList = ALLOWED_EMAILS) {
  if (!allowList || allowList.length === 0) return true;
  const lower = String(email).toLowerCase();
  const atIdx = lower.indexOf("@");
  if (atIdx < 0) return false;
  const domain = lower.slice(atIdx);
  return allowList.some((p) => p === lower || p === domain);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Markdown renderer ---

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch (_) {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

md.use(anchor, { permalink: false });

// --- HTML templates ---

function pageHtml(title, bodyContent, pathSegments, rawUrl, opts) {
  let headerLinks = `<a href="/">${escapeHtml(SITE_DOMAIN)}</a>`;
  if (pathSegments) {
    for (const seg of pathSegments) {
      if (seg.href) {
        headerLinks += ` <span class="sep">/</span> <a href="${escapeHtml(seg.href)}">${escapeHtml(seg.label)}</a>`;
      } else {
        headerLinks += ` <span class="sep">/</span> <span class="current">${escapeHtml(seg.label)}</span>`;
      }
    }
  }

  const rawLink = rawUrl
    ? `<a href="${escapeHtml(rawUrl)}" class="raw-link">raw</a>`
    : "";

  const deleteBtn = opts && opts.canDelete
    ? `<button class="delete-link" onclick="openDeleteModal()" aria-label="Delete this file">delete</button>`
    : "";

  const deleteModal = opts && opts.canDelete
    ? `<div class="modal-overlay" id="deleteModal" onclick="if(event.target===this)closeDeleteModal()" aria-hidden="true">
    <div class="modal" role="dialog" aria-labelledby="deleteModalTitle" aria-modal="true">
      <h2 id="deleteModalTitle">Delete this file?</h2>
      <p class="modal-path">${escapeHtml(opts.deletePath)}</p>
      <p class="modal-warning">This cannot be undone. The file will be removed permanently.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeDeleteModal()">Cancel</button>
        <button class="btn btn-danger" id="deleteConfirm" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>
  <script>
    const DELETE_PATH = ${JSON.stringify(opts.deletePath)};
    const DELETE_REDIRECT = ${JSON.stringify(opts.deleteRedirect || "/")};
    function openDeleteModal() {
      const m = document.getElementById("deleteModal");
      m.classList.add("open");
      m.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", escClose);
    }
    function closeDeleteModal() {
      const m = document.getElementById("deleteModal");
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", escClose);
    }
    function escClose(e) { if (e.key === "Escape") closeDeleteModal(); }
    async function confirmDelete() {
      const btn = document.getElementById("deleteConfirm");
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        const r = await fetch("/api/delete", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: DELETE_PATH }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || ("HTTP " + r.status));
        }
        window.location.href = DELETE_REDIRECT;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Delete";
        alert("Delete failed: " + e.message);
      }
    }
  </script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — sharemd</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" id="hljs-light" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
  <link rel="stylesheet" id="hljs-dark" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css">
  <style>${CSS}</style>
  <script>${THEME_JS}</script>
</head>
<body>
  <header class="header"><nav class="header-inner">${headerLinks}<span class="header-right">${deleteBtn}${rawLink}<button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme"></button></span></nav></header>
  <div class="container">
    ${bodyContent}
  </div>
  <footer class="footer">shared via <a href="https://github.com/a2u/sharemd"><strong>sharemd</strong></a> ❤️</footer>
  ${deleteModal}
</body>
</html>`;
}

const LANDING_TEMPLATE = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
const DENIED_TEMPLATE = fs.readFileSync(path.join(__dirname, "denied.html"), "utf-8");
const CLI_SCRIPT = fs.readFileSync(path.join(__dirname, "bin", "sharemd"), "utf-8");

function landingHtml() {
  return LANDING_TEMPLATE
    .replace(/\{\{SITE_DOMAIN\}\}/g, escapeHtml(SITE_DOMAIN))
    .replace(/\{\{VERSION\}\}/g, escapeHtml(VERSION));
}

function buildInstallScript(token) {
  const url = BASE_URL;
  return `#!/usr/bin/env bash
set -euo pipefail

SHAREMD_URL="${url}"
SHAREMD_TOKEN="${token}"

if [ -z "$SHAREMD_TOKEN" ]; then
  echo "error: missing token. Copy the full command from your /panel page." >&2
  exit 1
fi

command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "error: jq is required (brew install jq / apt install jq)" >&2; exit 1; }

INSTALL_DIR="\${SHAREMD_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$INSTALL_DIR"

echo "Downloading sharemd CLI to $INSTALL_DIR/sharemd ..."
curl -fsSL "$SHAREMD_URL/install/cli" -o "$INSTALL_DIR/sharemd"
chmod +x "$INSTALL_DIR/sharemd"

CONFIG="$HOME/.sharemdrc"
umask 077
cat > "$CONFIG" <<EOF
export SHAREMD_URL="$SHAREMD_URL"
export SHAREMD_TOKEN="$SHAREMD_TOKEN"
EOF

for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$rc" ] || continue
  grep -q 'sharemdrc' "$rc" 2>/dev/null && continue
  printf '\\n[ -f "$HOME/.sharemdrc" ] && source "$HOME/.sharemdrc"\\n' >> "$rc"
done

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "note: $INSTALL_DIR is not in your PATH yet. Add this to your shell rc:"
    echo "  export PATH=\\"\\$PATH:$INSTALL_DIR\\""
    ;;
esac

echo ""
echo "Installed."
echo "  binary: $INSTALL_DIR/sharemd"
echo "  config: $CONFIG"
echo ""
echo "Activate in this shell:"
echo "  source $CONFIG"
echo ""
echo "Then try:"
echo "  sharemd yourfile.md"
`;
}

function deniedHtml() {
  const adminContact = ADMIN_EMAIL
    ? `Contact the admin to request access: <a href="mailto:${escapeHtml(ADMIN_EMAIL)}">${escapeHtml(ADMIN_EMAIL)}</a>`
    : `Contact the administrator of this instance to request access.`;
  return DENIED_TEMPLATE
    .replace(/\{\{SITE_DOMAIN\}\}/g, escapeHtml(SITE_DOMAIN))
    .replace(/\{\{ADMIN_CONTACT\}\}/g, adminContact);
}

function panelHtml(email, token, usedBytes, limitMb) {
  const limitBytes = limitMb * 1024 * 1024;
  const pct = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100).toFixed(1) : 0;
  const barWidth = Math.min(100, Math.round(pct));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>panel — ${escapeHtml(SITE_DOMAIN)}</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #aaa;
      font-family: "Courier New", Courier, monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .terminal { max-width: 640px; padding: 2rem; }
    .title { color: #fff; font-size: 1rem; margin-bottom: 2rem; }
    .field { margin-bottom: 1.2rem; font-size: 0.85rem; line-height: 1.6; }
    .label { color: #666; }
    .value { color: #fff; }
    .token { color: #fff; font-size: 0.75rem; word-break: break-all; }
    .bar-bg {
      margin-top: 0.4rem;
      height: 6px; background: #222; border-radius: 3px; overflow: hidden;
    }
    .bar-fill { height: 100%; background: #aaa; border-radius: 3px; }
    .snippet {
      display: block;
      margin-top: 0.4rem;
      padding: 0.6rem 0.8rem;
      background: #141414;
      border: 1px solid #222;
      border-radius: 4px;
      color: #fff;
      font-family: inherit;
      font-size: 0.75rem;
      line-height: 1.5;
      word-break: break-all;
      white-space: pre-wrap;
      user-select: all;
    }
    .hint { color: #666; font-size: 0.75rem; margin-top: 0.4rem; }
    .nav { margin-top: 2rem; font-size: 0.8rem; display: flex; gap: 1.5rem; }
    .nav a { color: #666; text-decoration: none; }
    .nav a:hover { color: #fff; }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="title">~ panel</div>
    <div class="field">
      <span class="label">email</span><br>
      <span class="value">${escapeHtml(email)}</span>
    </div>
    <div class="field">
      <span class="label">token</span><br>
      <span class="token">${escapeHtml(token)}</span>
    </div>
    <div class="field">
      <span class="label">storage</span><br>
      <span class="value">${formatBytes(usedBytes)}</span> <span class="label">/ ${limitMb} MB (${pct}%)</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${barWidth}%"></div></div>
    </div>
    <div class="field">
      <span class="label">install cli</span>
      <code class="snippet">curl -fsSL "${escapeHtml(BASE_URL)}/install?token=${escapeHtml(token)}" | bash</code>
      <div class="hint">Paste in your terminal. Requires <span class="value">curl</span> and <span class="value">jq</span>. Then: <span class="value">sharemd file.md</span></div>
    </div>
    <div class="nav">
      <a href="/">/home</a>
      <a href="/logout">/logout</a>
    </div>
  </div>
</body>
</html>`;
}

const CSS = `
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --border: #d0d7de;
  --accent: #0969da;
  --code-bg: #f6f8fa;
  --card-bg: #ffffff;
  --card-hover: #f6f8fa;
  --header-bg: rgba(255,255,255,0.85);
  --toggle-icon: "☀️";
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8b949e;
    --border: #30363d;
    --accent: #58a6ff;
    --code-bg: #161b22;
    --card-bg: #161b22;
    --card-hover: #1c2129;
    --header-bg: rgba(13,17,23,0.85);
    --toggle-icon: "🌙";
  }
}
[data-theme="dark"] {
  --bg: #0d1117;
  --fg: #e6edf3;
  --muted: #8b949e;
  --border: #30363d;
  --accent: #58a6ff;
  --code-bg: #161b22;
  --card-bg: #161b22;
  --card-hover: #1c2129;
  --header-bg: rgba(13,17,23,0.85);
  --toggle-icon: "🌙";
}
[data-theme="light"] { --toggle-icon: "☀️"; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  position: sticky; top: 0; z-index: 10;
  background: var(--header-bg); border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}
.header-inner {
  max-width: 860px; margin: 0 auto;
  padding: 0.6rem 1.5rem;
  font-size: 0.875rem; font-weight: 500;
  display: flex; align-items: center;
}
.header a { color: var(--accent); text-decoration: none; }
.header a:hover { text-decoration: underline; }
.header .sep { color: var(--muted); margin: 0 0.4rem; }
.header .current { color: var(--fg); }
.header-right {
  margin-left: auto;
  display: flex; align-items: center; gap: 0.75rem;
}
.raw-link {
  font-size: 0.75rem;
  color: var(--muted) !important;
  text-decoration: none !important;
  border: 1px solid var(--border);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}
.raw-link:hover { color: var(--fg) !important; border-color: var(--muted); }
.delete-link {
  font-size: 0.75rem;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.4;
}
.delete-link:hover { color: #cf222e; border-color: #cf222e; }
[data-theme="dark"] .delete-link:hover,
:root:not([data-theme]) .delete-link:hover { color: #ff7b72; border-color: #ff7b72; }
.theme-toggle {
  background: none; border: none; cursor: pointer;
  font-size: 1rem; padding: 0.2rem;
  line-height: 1;
}
.theme-toggle::after { content: var(--toggle-icon); }
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: none;
  align-items: center; justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.modal-overlay.open { display: flex; }
.modal {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 420px; width: 100%;
  padding: 1.5rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.modal h2 {
  font-size: 1.1rem; font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--fg);
}
.modal-path {
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 0.85rem;
  color: var(--fg);
  background: var(--code-bg);
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  margin-bottom: 0.75rem;
  word-break: break-all;
}
.modal-warning {
  font-size: 0.875rem;
  color: var(--muted);
  margin-bottom: 1.25rem;
}
.modal-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem;
}
.btn {
  font-family: inherit;
  font-size: 0.875rem;
  padding: 0.4rem 0.9rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--card-bg);
  color: var(--fg);
}
.btn:hover { background: var(--card-hover); }
.btn-danger {
  background: #cf222e;
  border-color: #cf222e;
  color: #fff;
}
.btn-danger:hover { background: #a40e26; border-color: #a40e26; }
.btn-danger:disabled { opacity: 0.6; cursor: wait; }
.container {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  flex: 1;
  width: 100%;
}

/* Markdown body */
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600;
  border-bottom: none;
}
.markdown-body h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.markdown-body p { margin-bottom: 1em; }
.markdown-body a { color: var(--accent); text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body code {
  background: var(--code-bg); padding: 0.2em 0.4em; border-radius: 6px;
  font-size: 0.875em; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}
.markdown-body pre { margin-bottom: 1em; border-radius: 6px; overflow-x: auto; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body pre.hljs {
  background: var(--code-bg); padding: 1em; border-radius: 6px;
}
.markdown-body blockquote {
  border-left: 4px solid var(--border); padding: 0.5em 1em; margin-bottom: 1em;
  color: var(--muted);
}
.markdown-body ul, .markdown-body ol { margin-bottom: 1em; padding-left: 2em; }
.markdown-body li { margin-bottom: 0.25em; }
.markdown-body img { max-width: 100%; border-radius: 6px; }
.markdown-body table {
  border-collapse: collapse; width: 100%; margin-bottom: 1em;
}
.markdown-body th, .markdown-body td {
  border: 1px solid var(--border); padding: 0.5em 1em; text-align: left;
}
.markdown-body th { background: var(--code-bg); font-weight: 600; }
.markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }

/* File listing */
.file-list { list-style: none; padding: 0; }
.file-list li {
  border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem;
  background: var(--card-bg); transition: background 0.15s;
}
.file-list li:hover { background: var(--card-hover); }
.file-list a {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem; text-decoration: none; color: var(--fg);
}
.file-list .icon { font-size: 1.25rem; flex-shrink: 0; }
.file-list .path { color: var(--accent); font-weight: 500; }
.file-list .dir-prefix { color: var(--muted); font-weight: 400; }

.dir-heading { margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }

.footer {
  text-align: center; padding: 1.5rem; font-size: 0.8rem; color: var(--muted);
}
.footer a { color: var(--muted); text-decoration: none; }
.footer a:hover { color: var(--accent); text-decoration: underline; }
`;

const THEME_JS = `
(function(){
  var s = localStorage.getItem('theme');
  if (s) document.documentElement.setAttribute('data-theme', s);
})();
function toggleTheme() {
  var d = document.documentElement;
  var current = d.getAttribute('data-theme');
  if (!current) {
    current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var next = current === 'dark' ? 'light' : 'dark';
  d.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  var light = document.getElementById('hljs-light');
  var dark = document.getElementById('hljs-dark');
  if (light) light.disabled = (next === 'dark');
  if (dark) dark.disabled = (next === 'light');
}
(function(){
  var s = localStorage.getItem('theme');
  if (!s) s = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var light = document.getElementById('hljs-light');
  var dark = document.getElementById('hljs-dark');
  if (light) light.disabled = (s === 'dark');
  if (dark) dark.disabled = (s === 'light');
})();
`;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Storage ---

function userDir(userId) {
  return path.join(DATA_DIR, String(userId));
}

function resolveFilePath(userId, filePath) {
  const base = userDir(userId);
  const resolved = path.resolve(base, filePath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

function listMdFiles(dir, baseDir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listMdFiles(full, baseDir));
    } else if (entry.name.endsWith(".md")) {
      results.push(path.relative(baseDir, full));
    }
  }
  return results.sort();
}

function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSizeBytes(full);
    } else {
      try { total += fs.statSync(full).size; } catch {}
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rmRecursive(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

// --- URL helpers ---

function urlPrefix(userId) {
  return Number(userId) === SUPERADMIN_ID ? "" : `/${userId}`;
}

function publicUrl(userId, filePath) {
  return `${BASE_URL}${urlPrefix(userId)}/${filePath}`;
}

function buildSegments(userId, filePath) {
  const parts = filePath.split("/");
  const prefix = urlPrefix(userId);
  const segments = [];
  for (let i = 0; i < parts.length - 1; i++) {
    segments.push({ label: parts[i], href: `${prefix}/${parts.slice(0, i + 1).join("/")}` });
  }
  segments.push({ label: parts[parts.length - 1] });
  return segments;
}

// --- Users ---

function loadUsers() {
  const fp = path.join(DATA_DIR, "users.json");
  let raw;
  try {
    raw = fs.readFileSync(fp, "utf-8");
  } catch {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to parse ${fp}: ${e.message}`);
    return [];
  }
}

function findUserByToken(token) {
  const users = loadUsers();
  const tokenBuf = Buffer.from(token);
  for (const u of users) {
    if (u.token && u.token.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(u.token), tokenBuf)) {
      return u;
    }
  }
  return null;
}

// --- Auth middleware ---

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const user = findUserByToken(header.slice(7));
    if (user) {
      req.user = user;
      return next();
    }
  }

  // Session cookie fallback (SameSite=Lax, so no CSRF surface from cross-site POST/DELETE)
  const session = getSession(req);
  if (session) {
    const users = loadUsers();
    const user = users.find((u) => u.id === session.userId);
    if (user) {
      req.user = user;
      return next();
    }
  }

  return res.status(401).json({ error: "Invalid or missing token" });
}

function send404(res, message) {
  return res
    .status(404)
    .send(
      pageHtml("Not Found", `<h1>404</h1><p>${message || "Page not found."}</p>`)
    );
}

// --- Shared route handler ---

function handlePath(req, res, userId, filePath) {
  filePath = filePath.replace(/\/+$/, "");
  if (!filePath) return send404(res);

  const fp = resolveFilePath(userId, filePath);
  if (!fp) return send404(res);

  let stat;
  try {
    stat = fs.statSync(fp);
  } catch {
    return send404(res);
  }

  const prefix = urlPrefix(userId);

  // Directory listing
  if (stat.isDirectory()) {
    const files = listMdFiles(fp, fp);
    if (files.length === 0) return send404(res);

    const dirName = path.basename(filePath);
    const grouped = {};
    for (const f of files) {
      const d = path.dirname(f);
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(f);
    }

    const dirs = Object.keys(grouped).sort((a, b) => {
      if (a === ".") return -1;
      if (b === ".") return 1;
      return a.localeCompare(b);
    });

    let listHtml = `<h1>${escapeHtml(dirName)}</h1><p style="color:var(--muted);margin-bottom:1.5rem">${files.length} file${files.length !== 1 ? "s" : ""}</p>`;

    for (const dir of dirs) {
      if (dirs.length > 1 || dir !== ".") {
        listHtml += `<div class="dir-heading">${dir === "." ? "Root" : escapeHtml(dir)}</div>`;
      }
      listHtml += `<ul class="file-list">`;
      for (const f of grouped[dir]) {
        const basename = path.basename(f);
        const dirPfx = dir !== "." ? `${dir}/` : "";
        listHtml += `<li><a href="${prefix}/${filePath}/${f}"><span class="icon">📄</span><span><span class="dir-prefix">${escapeHtml(dirPfx)}</span><span class="path">${escapeHtml(basename)}</span></span></a></li>`;
      }
      listHtml += `</ul>`;
    }

    return res.send(pageHtml(dirName, listHtml, buildSegments(userId, filePath)));
  }

  // File — must be .md
  if (!filePath.endsWith(".md")) return send404(res);

  let content;
  try {
    content = fs.readFileSync(fp, "utf-8");
  } catch {
    return send404(res);
  }

  // Raw mode
  if (req.query.raw !== undefined) {
    res.type("text/plain; charset=utf-8").send(content);
    return;
  }

  const rendered = md.render(content);
  const rawUrl = `${prefix}/${filePath}?raw`;

  const session = getSession(req);
  const canDelete = session && Number(session.userId) === Number(userId);
  const parent = path.dirname(filePath);
  const deleteRedirect = parent === "." ? (prefix || "/") : `${prefix}/${parent}/`;

  res.send(
    pageHtml(
      path.basename(filePath),
      `<article class="markdown-body">${rendered}</article>`,
      buildSegments(userId, filePath),
      rawUrl,
      canDelete ? { canDelete: true, deletePath: filePath, deleteRedirect } : null
    )
  );
}

// --- App ---

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

function checkStorageLimit(user, newBytes) {
  const limitMb = user.storageLimitMb != null ? user.storageLimitMb : 20;
  const limitBytes = limitMb * 1024 * 1024;
  const usedBytes = dirSizeBytes(userDir(user.id));
  if (usedBytes + newBytes > limitBytes) {
    return {
      error: "storage limit exceeded",
      used: formatBytes(usedBytes),
      limit: `${limitMb} MB`,
    };
  }
  return null;
}

// Upload single file
app.post("/api/upload", auth, (req, res) => {
  const { content, filename, overwrite } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  const userId = req.user.id;
  const name = filename || "document.md";
  const fp = resolveFilePath(userId, name);
  if (!fp) return res.status(400).json({ error: "invalid filename" });

  if (fs.existsSync(fp) && !overwrite) {
    return res.status(409).json({
      exists: true,
      url: publicUrl(userId, name),
    });
  }

  const limitErr = checkStorageLimit(req.user, Buffer.byteLength(content));
  if (limitErr) return res.status(413).json(limitErr);

  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);

  res.json({ url: publicUrl(userId, name) });
});

// Upload bundle (directory)
app.post("/api/upload-bundle", auth, (req, res) => {
  const { files, overwrite } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files array is required" });
  }

  let dirPrefix = null;
  for (const f of files) {
    if (!f.path || !f.content) {
      return res
        .status(400)
        .json({ error: "each file must have path and content" });
    }
    if (path.isAbsolute(f.path) || f.path.split("/").includes("..")) {
      return res.status(400).json({ error: `invalid path: ${f.path}` });
    }
    const topDir = f.path.split("/")[0];
    if (dirPrefix === null) dirPrefix = topDir;
    else if (dirPrefix !== topDir) dirPrefix = null;
  }

  const userId = req.user.id;
  const totalNewBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
  const limitErr = checkStorageLimit(req.user, totalNewBytes);
  if (limitErr) return res.status(413).json(limitErr);

  if (!overwrite) {
    const existing = files
      .filter((f) => {
        const fp = resolveFilePath(userId, f.path);
        return fp && fs.existsSync(fp);
      })
      .map((f) => f.path);

    if (existing.length > 0) {
      return res.status(409).json({
        exists: true,
        files: existing,
        url: publicUrl(userId, dirPrefix || ""),
      });
    }
  }

  for (const f of files) {
    const fp = resolveFilePath(userId, f.path);
    if (!fp) return res.status(400).json({ error: `invalid path: ${f.path}` });
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, f.content);
  }

  const url = dirPrefix
    ? publicUrl(userId, dirPrefix)
    : `${BASE_URL}${urlPrefix(userId)}`;
  res.json({ url });
});

// List files (API, requires auth)
app.get("/api/files", auth, (req, res) => {
  const dir = userDir(req.user.id);
  const files = listMdFiles(dir, dir);
  res.json({ files });
});

// Delete file or directory (API, requires auth)
app.delete("/api/delete", auth, (req, res) => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    return res.status(400).json({ error: "path is required" });
  }
  if (path.isAbsolute(targetPath) || targetPath.split("/").includes("..")) {
    return res.status(400).json({ error: "invalid path" });
  }

  const fp = resolveFilePath(req.user.id, targetPath);
  if (!fp) return res.status(400).json({ error: "invalid path" });

  let stat;
  try {
    stat = fs.statSync(fp);
  } catch {
    return res.status(404).json({ error: "not found" });
  }

  if (stat.isDirectory()) {
    const files = listMdFiles(fp, fp);
    rmRecursive(fp);
    res.json({ deleted: files.length, path: targetPath });
  } else {
    fs.unlinkSync(fp);
    res.json({ deleted: 1, path: targetPath });
  }
});

// --- Google OAuth ---

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : new URLSearchParams(body).toString();
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try { resolve(JSON.parse(chunks)); } catch { reject(new Error(chunks)); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try { resolve(JSON.parse(chunks)); } catch { reject(new Error(chunks)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Signed cookie sessions (survive restarts, no server-side storage)

const SECRET_PATH = path.join(DATA_DIR, ".session-secret");
const SESSION_SECRET = (() => {
  try {
    return fs.readFileSync(SECRET_PATH, "utf-8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_PATH, secret);
    return secret;
  }
})();

function signSession(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifySession(cookie) {
  const [data, sig] = cookie.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(user) {
  return signSession({ userId: user.id, email: user.email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
}

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)sid=([^\s;]+)/);
  if (!match) return null;
  return verifySession(match[1]);
}

app.get("/login", (req, res) => {
  if (getSession(req)) return res.redirect("/panel");
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).send(pageHtml("Error", "<h1>Google OAuth not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env</p>"));
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/google/callback`,
    response_type: "code",
    scope: "email profile",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/login/denied", (req, res) => {
  res.status(403).send(deniedHtml());
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.status(400).send(pageHtml("Login Failed", `<h1>Login failed</h1><p>${escapeHtml(error || "No code received")}</p>`));
  }

  try {
    // Exchange code for tokens
    const tokens = await httpsPost("https://oauth2.googleapis.com/token", {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${BASE_URL}/auth/google/callback`,
      grant_type: "authorization_code",
    });

    if (!tokens.access_token) {
      return res.status(400).send(pageHtml("Login Failed", "<h1>Login failed</h1><p>Could not get access token</p>"));
    }

    // Get user info
    const userInfo = await httpsGet(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { Authorization: `Bearer ${tokens.access_token}` }
    );

    if (!userInfo.email) {
      return res.status(400).send(pageHtml("Login Failed", "<h1>Login failed</h1><p>Could not get email</p>"));
    }

    // Find or create user
    const users = loadUsers();
    let user = users.find((u) => u.email === userInfo.email);

    if (!user) {
      if (!isEmailAllowed(userInfo.email)) {
        return res.redirect("/login/denied");
      }
      const maxId = users.reduce((m, u) => Math.max(m, u.id), 0);
      user = {
        id: maxId + 1,
        email: userInfo.email,
        token: `shmd_tk_${crypto.randomBytes(12).toString("hex")}`,
        registeredAt: new Date().toISOString(),
        storageLimitMb: 20,
      };
      users.push(user);
      fs.writeFileSync(path.join(DATA_DIR, "users.json"), JSON.stringify(users, null, 2));
    }

    // Create session
    const sid = createSession(user);
    res.setHeader("Set-Cookie", `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    res.redirect("/panel");
  } catch (e) {
    console.error("Google OAuth error:", e.message);
    res.status(500).send(pageHtml("Error", "<h1>Login error</h1><p>Something went wrong</p>"));
  }
});

app.get("/logout", (req, res) => {
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; Max-Age=0");
  res.redirect("/");
});

app.get("/panel", (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect("/login");

  const users = loadUsers();
  const user = users.find((u) => u.id === session.userId);
  const email = user ? user.email : session.email;
  const token = user ? user.token : "—";
  const limitMb = user ? user.storageLimitMb : 20;
  const usedBytes = dirSizeBytes(userDir(session.userId));

  res.send(panelHtml(email, token, usedBytes, limitMb));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()), version: VERSION });
});

// Shell installer: curl -fsSL $BASE_URL/install?token=... | bash
app.get("/install", (req, res) => {
  const rawToken = String(req.query.token || "").trim();
  const tokenOk = /^[A-Za-z0-9_]{8,128}$/.test(rawToken);

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(buildInstallScript(tokenOk ? rawToken : ""));
});

// Raw CLI binary (the installer curls this)
app.get("/install/cli", (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(CLI_SCRIPT);
});

// --- Public routes ---

// Landing page
app.get("/", (req, res) => {
  res.send(landingHtml());
});

// Non-superadmin user routes (future: other users with /:userId/...)
app.get("/:userId", (req, res, next) => {
  if (!/^\d+$/.test(req.params.userId)) return next();
  return send404(res);
});

app.get("/:userId/:filePath(*)", (req, res, next) => {
  const userId = req.params.userId;
  if (!/^\d+$/.test(userId)) return next();
  handlePath(req, res, userId, req.params.filePath);
});

// Superadmin catch-all: /path → user 1
app.get("/:filePath(*)", (req, res) => {
  const filePath = req.params.filePath;
  if (!filePath) return send404(res);
  handlePath(req, res, String(SUPERADMIN_ID), filePath);
});

// --- Export for testing ---

function createServer() {
  return app;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`sharemd running at ${BASE_URL}`);
  });
}

module.exports = { createServer, DATA_DIR, SUPERADMIN_ID, isEmailAllowed, createSession };
