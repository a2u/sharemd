require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MarkdownIt = require("markdown-it");
const hljs = require("highlight.js");
const anchor = require("markdown-it-anchor");

// --- Config ---

const PORT = process.env.PORT || 3737;
const TOKEN = process.env.SHAREMD_TOKEN || "shmd_tk_9f4a2b7e1c8d3056";
const USER_ID = 1; // hardcoded for now
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(
  /\/$/,
  ""
);
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const SITE_DOMAIN = process.env.SITE_DOMAIN || "sharemd";

fs.mkdirSync(path.join(DATA_DIR, String(USER_ID)), { recursive: true });

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

function pageHtml(title, bodyContent, pathSegments) {
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — sharemd</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css" media="(prefers-color-scheme: light)">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
  <style>${CSS}</style>
</head>
<body>
  <header class="header"><nav class="header-inner">${headerLinks}</nav></header>
  <div class="container">
    ${bodyContent}
  </div>
  <footer class="footer">shared via <a href="https://github.com/a2u/sharemd"><strong>sharemd</strong></a></footer>
</body>
</html>`;
}

function landingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SITE_DOMAIN)}</title>
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
    .terminal {
      max-width: 640px;
      padding: 2rem;
    }
    .ascii {
      color: #fff;
      font-size: 0.7rem;
      line-height: 1.2;
      white-space: pre;
      margin-bottom: 2rem;
    }
    @media (max-width: 480px) {
      .ascii { font-size: 0.45rem; }
    }
    .desc {
      font-size: 0.9rem;
      line-height: 1.7;
      margin-bottom: 1.5rem;
    }
    .desc strong { color: #fff; }
    .prompt {
      color: #666;
      font-size: 0.8rem;
      line-height: 1.8;
    }
    .prompt span { color: #888; }
    a { color: #888; }
    a:hover { color: #fff; }
    .blink {
      display: inline-block;
      width: 0.55em;
      height: 1em;
      background: #aaa;
      vertical-align: text-bottom;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="terminal">
    <div class="ascii"> _                                  _
| |                                | |
___| |__   __ _ _ __ ___ _ __ ___   __| |
/ __| '_ \\ / _\` | '__/ _ \\ '_ \` _ \\ / _\` |
\\__ \\ | | | (_| | | |  __/ | | | | | (_| |
|___/_| |_|\\__,_|_|  \\___|_| |_| |_|\\__,_|</div>
    <div class="desc">
      <strong>Markdown file sharing.</strong> Upload <strong>.md</strong> files,
      get a clean URL with rendered content. Syntax highlighting,
      dark/light theme, directory support. No database &mdash; just
      files on disk.
    </div>
    <div class="prompt">
      <span>$</span> sharemd article.md<br>
      <span>&rarr;</span> ${escapeHtml(SITE_DOMAIN)}/1/article.md<br><br>
      <span>$</span> sharemd docs/<br>
      <span>&rarr;</span> ${escapeHtml(SITE_DOMAIN)}/1/docs<br><br>
      <a href="https://github.com/a2u/sharemd">github.com/a2u/sharemd</a><span class="blink"></span>
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
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8b949e;
    --border: #30363d;
    --accent: #58a6ff;
    --code-bg: #161b22;
    --card-bg: #161b22;
    --card-hover: #1c2129;
    --header-bg: rgba(13,17,23,0.85);
  }
}
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

function rmRecursive(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

// --- Auth middleware ---

function auth(req, res, next) {
  const header = req.headers.authorization;
  const expected = `Bearer ${TOKEN}`;
  if (
    !header ||
    header.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  ) {
    return res.status(401).json({ error: "Invalid or missing token" });
  }
  next();
}

function buildSegments(userId, filePath) {
  const parts = filePath.split("/");
  const segments = [];
  for (let i = 0; i < parts.length - 1; i++) {
    segments.push({ label: parts[i], href: `/${userId}/${parts.slice(0, i + 1).join("/")}` });
  }
  segments.push({ label: parts[parts.length - 1] });
  return segments;
}

function send404(res, message) {
  return res
    .status(404)
    .send(
      pageHtml("Not Found", `<h1>404</h1><p>${message || "Page not found."}</p>`)
    );
}

// --- App ---

const app = express();
app.use(express.json({ limit: "10mb" }));

// Upload single file
app.post("/api/upload", auth, (req, res) => {
  const { content, filename, overwrite } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  const name = filename || "document.md";
  const fp = resolveFilePath(USER_ID, name);
  if (!fp) return res.status(400).json({ error: "invalid filename" });

  if (fs.existsSync(fp) && !overwrite) {
    return res.status(409).json({
      exists: true,
      url: `${BASE_URL}/${USER_ID}/${name}`,
    });
  }

  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);

  res.json({ url: `${BASE_URL}/${USER_ID}/${name}` });
});

// Upload bundle (directory)
app.post("/api/upload-bundle", auth, (req, res) => {
  const { files, overwrite } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files array is required" });
  }

  // Derive the common directory prefix for the response URL
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

  // Check for existing files
  if (!overwrite) {
    const existing = files
      .filter((f) => {
        const fp = resolveFilePath(USER_ID, f.path);
        return fp && fs.existsSync(fp);
      })
      .map((f) => f.path);

    if (existing.length > 0) {
      return res.status(409).json({
        exists: true,
        files: existing,
        url: `${BASE_URL}/${USER_ID}/${dirPrefix || ""}`,
      });
    }
  }

  // Write all files
  for (const f of files) {
    const fp = resolveFilePath(USER_ID, f.path);
    if (!fp) continue;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, f.content);
  }

  const url = dirPrefix
    ? `${BASE_URL}/${USER_ID}/${dirPrefix}`
    : `${BASE_URL}/${USER_ID}`;
  res.json({ url });
});

// List files (API, requires auth)
app.get("/api/files", auth, (req, res) => {
  const dir = userDir(USER_ID);
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

  const fp = resolveFilePath(USER_ID, targetPath);
  if (!fp) return res.status(400).json({ error: "invalid path" });

  if (!fs.existsSync(fp)) {
    return res.status(404).json({ error: "not found" });
  }

  const stat = fs.statSync(fp);
  if (stat.isDirectory()) {
    const files = listMdFiles(fp, fp);
    rmRecursive(fp);
    res.json({ deleted: files.length, path: targetPath });
  } else {
    fs.unlinkSync(fp);
    res.json({ deleted: 1, path: targetPath });
  }
});

// --- Public routes ---

// Landing page
app.get("/", (req, res) => {
  res.send(landingHtml());
});

// Catch /:userId — no public listing
app.get("/:userId", (req, res) => {
  return send404(res);
});

// View file or directory listing
app.get("/:userId/:filePath(*)", (req, res) => {
  const userId = req.params.userId;
  if (!/^\d+$/.test(userId)) return send404(res);

  const filePath = req.params.filePath.replace(/\/+$/, ""); // strip trailing slash
  if (!filePath) return send404(res);

  const fp = resolveFilePath(userId, filePath);
  if (!fp) return send404(res);

  // Check if it's a directory — render listing
  let stat;
  try {
    stat = fs.statSync(fp);
  } catch {
    return send404(res);
  }

  if (stat.isDirectory()) {
    const files = listMdFiles(fp, fp);
    if (files.length === 0) return send404(res);

    const dirName = path.basename(filePath);

    // Group by subdirectory
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
        listHtml += `<li><a href="/${userId}/${filePath}/${f}"><span class="icon">📄</span><span><span class="dir-prefix">${escapeHtml(dirPfx)}</span><span class="path">${escapeHtml(basename)}</span></span></a></li>`;
      }
      listHtml += `</ul>`;
    }

    return res.send(pageHtml(dirName, listHtml, buildSegments(userId, filePath)));
  }

  // It's a file — render markdown
  if (!filePath.endsWith(".md")) return send404(res);

  let content;
  try {
    content = fs.readFileSync(fp, "utf-8");
  } catch {
    return send404(res);
  }

  const rendered = md.render(content);

  res.send(
    pageHtml(
      path.basename(filePath),
      `<article class="markdown-body">${rendered}</article>`,
      buildSegments(userId, filePath)
    )
  );
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

module.exports = { createServer, DATA_DIR, USER_ID };
