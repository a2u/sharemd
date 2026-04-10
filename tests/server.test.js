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

const { createServer, SUPERADMIN_ID } = require("../server");

let server;
const BASE = `http://localhost:${TEST_PORT}`;

function req(method, urlPath, body, token) {
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
});

// --- Public routes ---

describe("superadmin URLs", () => {
  it("/1/path redirects to /path", async () => {
    await req("POST", "/api/upload", { content: "# Hi", filename: "redir.md" });
    const res = await req("GET", "/1/redir.md", null, false);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/redir.md");
  });

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
