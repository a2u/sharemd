const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Use a temp data dir and different port for tests
const TEST_PORT = 4747;
const TEST_DATA = path.join(__dirname, ".test-data");
const TOKEN = "shmd_tk_9f4a2b7e1c8d3056";

process.env.PORT = TEST_PORT;
process.env.DATA_DIR = TEST_DATA;
process.env.BASE_URL = `http://localhost:${TEST_PORT}`;
process.env.ALLOWED_EMAILS = "";
process.env.ADMIN_EMAIL = "";

const { createServer, SUPERADMIN_ID, isEmailAllowed, createSession } = require("../server");

let server;
const BASE = `http://localhost:${TEST_PORT}`;

function req(method, urlPath, body, token, extra) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {},
    };
    let payload;
    if (body) {
      payload = JSON.stringify(body);
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token !== false) {
      opts.headers["Authorization"] = `Bearer ${token || TOKEN}`;
    }
    if (extra && extra.cookie) {
      opts.headers["Cookie"] = extra.cookie;
    }
    const r = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, body: json, html: data, headers: res.headers });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function cleanData() {
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_DATA, String(SUPERADMIN_ID)), { recursive: true });
  // Write users.json so auth works
  fs.writeFileSync(path.join(TEST_DATA, "users.json"), JSON.stringify([
    { id: SUPERADMIN_ID, email: "test@test.com", token: TOKEN, registeredAt: "2026-04-09T00:00:00.000Z", storageLimitMb: 20 }
  ]));
}

before((_, done) => {
  cleanData();
  server = createServer().listen(TEST_PORT, done);
});

after((_, done) => {
  server.close(() => {
    fs.rmSync(TEST_DATA, { recursive: true, force: true });
    done();
  });
});

beforeEach(() => {
  cleanData();
});

// --- Auth ---

describe("auth", () => {
  it("rejects missing token", async () => {
    const res = await req("POST", "/api/upload", { content: "# Hi", filename: "a.md" }, false);
    assert.equal(res.status, 401);
  });

  it("rejects wrong token", async () => {
    const res = await req("POST", "/api/upload", { content: "# Hi", filename: "a.md" }, "wrong");
    assert.equal(res.status, 401);
  });

  it("accepts valid token", async () => {
    const res = await req("POST", "/api/upload", { content: "# Hi", filename: "a.md" });
    assert.equal(res.status, 200);
  });
});

// --- Upload single file ---

describe("POST /api/upload", () => {
  it("uploads a file and returns url without user id prefix", async () => {
    const res = await req("POST", "/api/upload", { content: "# Test", filename: "test.md" });
    assert.equal(res.status, 200);
    assert.ok(res.body.url.endsWith("/test.md"));
    assert.ok(!res.body.url.includes("/1/")); // superadmin: no /1/ in url

    const fp = path.join(TEST_DATA, "1", "test.md");
    assert.ok(fs.existsSync(fp));
    assert.equal(fs.readFileSync(fp, "utf-8"), "# Test");
  });

  it("returns 400 without content", async () => {
    const res = await req("POST", "/api/upload", { filename: "a.md" });
    assert.equal(res.status, 400);
  });

  it("returns 409 on duplicate filename", async () => {
    await req("POST", "/api/upload", { content: "v1", filename: "dup.md" });
    const res = await req("POST", "/api/upload", { content: "v2", filename: "dup.md" });
    assert.equal(res.status, 409);
    assert.equal(res.body.exists, true);
  });

  it("overwrites with overwrite flag", async () => {
    await req("POST", "/api/upload", { content: "v1", filename: "ow.md" });
    const res = await req("POST", "/api/upload", { content: "v2", filename: "ow.md", overwrite: true });
    assert.equal(res.status, 200);

    const fp = path.join(TEST_DATA, "1", "ow.md");
    assert.equal(fs.readFileSync(fp, "utf-8"), "v2");
  });

  it("rejects path traversal in filename", async () => {
    const res = await req("POST", "/api/upload", { content: "x", filename: "../evil.md" });
    assert.equal(res.status, 400);
  });
});

// --- Upload bundle ---

describe("POST /api/upload-bundle", () => {
  it("uploads multiple files preserving paths", async () => {
    const res = await req("POST", "/api/upload-bundle", {
      files: [
        { path: "docs/a.md", content: "# A" },
        { path: "docs/b.md", content: "# B" },
      ],
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.url.includes("/docs"));

    assert.ok(fs.existsSync(path.join(TEST_DATA, "1", "docs", "a.md")));
    assert.ok(fs.existsSync(path.join(TEST_DATA, "1", "docs", "b.md")));
  });

  it("returns 409 when files exist", async () => {
    await req("POST", "/api/upload-bundle", {
      files: [{ path: "d/x.md", content: "v1" }],
    });
    const res = await req("POST", "/api/upload-bundle", {
      files: [{ path: "d/x.md", content: "v2" }],
    });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.files, ["d/x.md"]);
  });

  it("overwrites with flag", async () => {
    await req("POST", "/api/upload-bundle", {
      files: [{ path: "d/x.md", content: "v1" }],
    });
    const res = await req("POST", "/api/upload-bundle", {
      files: [{ path: "d/x.md", content: "v2" }],
      overwrite: true,
    });
    assert.equal(res.status, 200);
    assert.equal(fs.readFileSync(path.join(TEST_DATA, "1", "d", "x.md"), "utf-8"), "v2");
  });

  it("rejects path traversal", async () => {
    const res = await req("POST", "/api/upload-bundle", {
      files: [{ path: "../../etc/passwd", content: "evil" }],
    });
    assert.equal(res.status, 400);
  });

  it("rejects empty files array", async () => {
    const res = await req("POST", "/api/upload-bundle", { files: [] });
    assert.equal(res.status, 400);
  });
});

// --- GET /api/files ---

describe("GET /api/files", () => {
  it("lists uploaded files", async () => {
    await req("POST", "/api/upload", { content: "# A", filename: "a.md" });
    await req("POST", "/api/upload-bundle", {
      files: [{ path: "dir/b.md", content: "# B" }],
    });

    const res = await req("GET", "/api/files");
    assert.equal(res.status, 200);
    assert.ok(res.body.files.includes("a.md"));
    assert.ok(res.body.files.includes("dir/b.md"));
  });

  it("requires auth", async () => {
    const res = await req("GET", "/api/files", null, false);
    assert.equal(res.status, 401);
  });
});

// --- DELETE /api/delete ---

describe("DELETE /api/delete", () => {
  it("deletes a single file", async () => {
    await req("POST", "/api/upload", { content: "# X", filename: "x.md" });
    const res = await req("DELETE", "/api/delete", { path: "x.md" });
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);
    assert.ok(!fs.existsSync(path.join(TEST_DATA, "1", "x.md")));
  });

  it("deletes a directory recursively", async () => {
    await req("POST", "/api/upload-bundle", {
      files: [
        { path: "rm-dir/a.md", content: "a" },
        { path: "rm-dir/sub/b.md", content: "b" },
      ],
    });
    const res = await req("DELETE", "/api/delete", { path: "rm-dir" });
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 2);
    assert.ok(!fs.existsSync(path.join(TEST_DATA, "1", "rm-dir")));
  });

  it("returns 404 for non-existent path", async () => {
    const res = await req("DELETE", "/api/delete", { path: "nope.md" });
    assert.equal(res.status, 404);
  });

  it("rejects path traversal", async () => {
    const res = await req("DELETE", "/api/delete", { path: "../../etc" });
    assert.equal(res.status, 400);
  });

  it("requires auth", async () => {
    const res = await req("DELETE", "/api/delete", { path: "x.md" }, false);
    assert.equal(res.status, 401);
  });

  it("accepts session cookie as auth", async () => {
    await req("POST", "/api/upload", { content: "# Y", filename: "y.md" });
    const sid = createSession({ id: SUPERADMIN_ID, email: "test@test.com" });
    const res = await req("DELETE", "/api/delete", { path: "y.md" }, false, {
      cookie: `sid=${sid}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);
  });
});

describe("delete button visibility", () => {
  it("is shown on owner's file page when session matches", async () => {
    await req("POST", "/api/upload", { content: "# own", filename: "own.md" });
    const sid = createSession({ id: SUPERADMIN_ID, email: "test@test.com" });
    const res = await req("GET", "/own.md", null, false, { cookie: `sid=${sid}` });
    assert.equal(res.status, 200);
    assert.match(res.html, /openDeleteModal/);
    assert.match(res.html, /Delete this file\?/);
  });

  it("is hidden for anonymous viewers", async () => {
    await req("POST", "/api/upload", { content: "# anon", filename: "anon.md" });
    const res = await req("GET", "/anon.md", null, false);
    assert.equal(res.status, 200);
    assert.ok(!res.html.includes("openDeleteModal"));
    assert.ok(!res.html.includes("Delete this file?"));
  });

  it("is hidden when logged-in viewer is not the owner", async () => {
    // Add a second user to users.json
    const users = JSON.parse(fs.readFileSync(path.join(TEST_DATA, "users.json"), "utf-8"));
    users.push({ id: 2, email: "u2@test.com", token: "shmd_tk_other0000000000", registeredAt: "2026-04-09T00:00:00.000Z", storageLimitMb: 20 });
    fs.writeFileSync(path.join(TEST_DATA, "users.json"), JSON.stringify(users));

    await req("POST", "/api/upload", { content: "# superadmin", filename: "admin.md" });

    // Visit as user 2
    const sid = createSession({ id: 2, email: "u2@test.com" });
    const res = await req("GET", "/admin.md", null, false, { cookie: `sid=${sid}` });
    assert.equal(res.status, 200);
    assert.ok(!res.html.includes("openDeleteModal"));
  });
});

// --- Public routes ---

describe("superadmin URLs", () => {
  it("renders file at /path directly", async () => {
    await req("POST", "/api/upload", { content: "# Direct", filename: "direct.md" });
    const res = await req("GET", "/direct.md", null, false);
    assert.equal(res.status, 200);
    assert.ok(res.html.includes("Direct"));
    assert.ok(res.html.includes("markdown-body"));
  });

  it("renders directory listing at /dir", async () => {
    await req("POST", "/api/upload-bundle", {
      files: [
        { path: "mydir/a.md", content: "# A" },
        { path: "mydir/b.md", content: "# B" },
      ],
    });
    const res = await req("GET", "/mydir", null, false);
    assert.equal(res.status, 200);
    assert.ok(res.html.includes("a.md"));
    assert.ok(res.html.includes("b.md"));
  });

  it("breadcrumb links have no /1/ prefix", async () => {
    await req("POST", "/api/upload-bundle", {
      files: [{ path: "nav/doc.md", content: "# Doc" }],
    });
    const res = await req("GET", "/nav/doc.md", null, false);
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('href="/nav"')); // not /1/nav
    assert.ok(!res.html.includes("/1/nav"));
  });
});

describe("raw mode", () => {
  it("returns raw markdown with ?raw", async () => {
    await req("POST", "/api/upload", { content: "# Raw Test\n\nHello", filename: "raw.md" });
    const res = await req("GET", "/raw.md?raw", null, false);
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/plain"));
    assert.equal(res.html, "# Raw Test\n\nHello");
  });

  it("shows raw link on rendered page", async () => {
    await req("POST", "/api/upload", { content: "# Hi", filename: "link.md" });
    const res = await req("GET", "/link.md", null, false);
    assert.ok(res.html.includes("?raw"));
    assert.ok(res.html.includes("raw-link"));
  });
});

describe("other public routes", () => {
  it("GET /1 returns 404", async () => {
    const res = await req("GET", "/1", null, false);
    assert.equal(res.status, 404);
  });

  it("returns 404 for non-.md file path", async () => {
    const res = await req("GET", "/something.txt", null, false);
    assert.equal(res.status, 404);
  });

  it("returns 404 for non-existent file", async () => {
    const res = await req("GET", "/nope.md", null, false);
    assert.equal(res.status, 404);
  });
});

// --- Auth routes ---

describe("login/panel/logout", () => {
  it("/login redirects to Google when not authenticated", async () => {
    const res = await req("GET", "/login", null, false);
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes("accounts.google.com"));
  });

  it("/panel redirects to /login when not authenticated", async () => {
    const res = await req("GET", "/panel", null, false);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/login");
  });

  it("/logout redirects to / and clears cookie", async () => {
    const res = await req("GET", "/logout", null, false);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/");
    const cookies = [].concat(res.headers["set-cookie"] || []).join("; ");
    assert.ok(cookies.includes("Max-Age=0"));
  });
});

// --- Multi-user auth ---

describe("multi-user token auth", () => {
  it("different tokens map to different user directories", async () => {
    // Add a second user to users.json
    const usersPath = path.join(TEST_DATA, "users.json");
    const users = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
    users.push({ id: 2, email: "other@test.com", token: "shmd_tk_other_user", registeredAt: "2026-04-10T00:00:00.000Z", storageLimitMb: 20 });
    fs.writeFileSync(usersPath, JSON.stringify(users));
    fs.mkdirSync(path.join(TEST_DATA, "2"), { recursive: true });

    // Upload as user 2
    const res = await req("POST", "/api/upload", { content: "# User2", filename: "u2.md" }, "shmd_tk_other_user");
    assert.equal(res.status, 200);
    assert.ok(res.body.url.includes("/2/u2.md")); // non-superadmin gets /{id}/ prefix

    // File is in user 2's directory
    assert.ok(fs.existsSync(path.join(TEST_DATA, "2", "u2.md")));
    assert.ok(!fs.existsSync(path.join(TEST_DATA, "1", "u2.md")));
  });

  it("user 2 files list only their own files", async () => {
    const usersPath = path.join(TEST_DATA, "users.json");
    const users = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
    users.push({ id: 2, email: "other@test.com", token: "shmd_tk_other_user", registeredAt: "2026-04-10T00:00:00.000Z", storageLimitMb: 20 });
    fs.writeFileSync(usersPath, JSON.stringify(users));

    // Upload as superadmin
    await req("POST", "/api/upload", { content: "# Admin", filename: "admin.md" });
    // Upload as user 2
    await req("POST", "/api/upload", { content: "# Other", filename: "other.md" }, "shmd_tk_other_user");

    // List as superadmin — should not see user 2's files
    const res1 = await req("GET", "/api/files");
    assert.ok(res1.body.files.includes("admin.md"));
    assert.ok(!res1.body.files.includes("other.md"));

    // List as user 2 — should not see superadmin's files
    const res2 = await req("GET", "/api/files", null, "shmd_tk_other_user");
    assert.ok(res2.body.files.includes("other.md"));
    assert.ok(!res2.body.files.includes("admin.md"));
  });
});

// --- Storage limits ---

describe("storage limits", () => {
  it("rejects upload when storage limit exceeded", async () => {
    // Set user's limit to tiny (1 byte effectively) by rewriting users.json
    const usersPath = path.join(TEST_DATA, "users.json");
    fs.writeFileSync(usersPath, JSON.stringify([
      { id: SUPERADMIN_ID, email: "test@test.com", token: TOKEN, registeredAt: "2026-04-09T00:00:00.000Z", storageLimitMb: 0 }
    ]));

    const res = await req("POST", "/api/upload", { content: "# Big", filename: "big.md" });
    assert.equal(res.status, 413);
    assert.ok(res.body.error.includes("storage limit"));
  });

  it("rejects bundle upload when storage limit exceeded", async () => {
    const usersPath = path.join(TEST_DATA, "users.json");
    fs.writeFileSync(usersPath, JSON.stringify([
      { id: SUPERADMIN_ID, email: "test@test.com", token: TOKEN, registeredAt: "2026-04-09T00:00:00.000Z", storageLimitMb: 0 }
    ]));

    const res = await req("POST", "/api/upload-bundle", {
      files: [{ path: "d/a.md", content: "# A" }],
    });
    assert.equal(res.status, 413);
    assert.ok(res.body.error.includes("storage limit"));
  });

  it("allows upload within storage limit", async () => {
    const res = await req("POST", "/api/upload", { content: "# OK", filename: "ok.md" });
    assert.equal(res.status, 200);
  });
});

// --- Health check ---

describe("health check", () => {
  it("GET /health returns ok with uptime", async () => {
    const res = await req("GET", "/health", null, false);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(typeof res.body.uptime, "number");
  });
});

// --- Email allowlist ---

describe("isEmailAllowed", () => {
  it("allows any email when list is empty", () => {
    assert.equal(isEmailAllowed("anyone@example.com", []), true);
    assert.equal(isEmailAllowed("anyone@example.com"), true);
  });

  it("matches exact emails case-insensitively", () => {
    const list = ["user@example.com"];
    assert.equal(isEmailAllowed("user@example.com", list), true);
    assert.equal(isEmailAllowed("USER@example.com", list), true);
    assert.equal(isEmailAllowed("other@example.com", list), false);
  });

  it("matches whole domains via @domain pattern", () => {
    const list = ["@cloudlinux.com"];
    assert.equal(isEmailAllowed("anyone@cloudlinux.com", list), true);
    assert.equal(isEmailAllowed("Someone@CloudLinux.com", list), true);
    assert.equal(isEmailAllowed("anyone@other.com", list), false);
  });

  it("supports mixed domain + exact entries", () => {
    const list = ["@cloudlinux.com", "partner@gmail.com"];
    assert.equal(isEmailAllowed("a@cloudlinux.com", list), true);
    assert.equal(isEmailAllowed("partner@gmail.com", list), true);
    assert.equal(isEmailAllowed("other@gmail.com", list), false);
  });

  it("rejects malformed email when list is non-empty", () => {
    assert.equal(isEmailAllowed("not-an-email", ["@example.com"]), false);
  });
});

describe("denied page", () => {
  it("GET /login/denied returns 403 and terminal-style page", async () => {
    const res = await req("GET", "/login/denied", null, false);
    assert.equal(res.status, 403);
    assert.match(res.html, /access restricted/i);
    assert.match(res.html, /cd \//);
  });
});

describe("install endpoints", () => {
  it("GET /install with valid token returns bash script with token baked in", async () => {
    const res = await req("GET", "/install?token=" + TOKEN, null, false);
    assert.equal(res.status, 200);
    assert.match(res.html, /^#!\/usr\/bin\/env bash/);
    assert.ok(res.html.includes(`SHAREMD_TOKEN="${TOKEN}"`));
    assert.ok(res.html.includes(`SHAREMD_URL="${BASE}"`));
  });

  it("GET /install with no token still returns a script, but with empty token", async () => {
    const res = await req("GET", "/install", null, false);
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('SHAREMD_TOKEN=""'));
    assert.match(res.html, /missing token/);
  });

  it("GET /install rejects shell-injection attempts in token", async () => {
    const bad = encodeURIComponent('abc"; rm -rf /; echo "');
    const res = await req("GET", "/install?token=" + bad, null, false);
    assert.equal(res.status, 200);
    assert.ok(res.html.includes('SHAREMD_TOKEN=""'), "malformed token must be discarded");
    assert.ok(!res.html.includes("rm -rf"));
  });

  it("GET /install/cli returns the bash CLI source", async () => {
    const res = await req("GET", "/install/cli", null, false);
    assert.equal(res.status, 200);
    assert.match(res.html, /^#!\/usr\/bin\/env bash/);
    assert.match(res.html, /Usage: sharemd/);
  });
});
