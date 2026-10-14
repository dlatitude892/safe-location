// The static, tracking-only build for Netlify (scripts/build-netlify.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { build, SERVER_PAGES, CONTENT_SECURITY_POLICY } = require(path.join(root, "scripts", "build-netlify.js"));

test("the Netlify build publishes only the public tracking-only site", () => {
  const files = build();
  const dist = path.join(root, "dist");
  for (const name of ["index.html", "welcome.html", "app.js", "style.css", "sw.js", "config.js", "_redirects", "_headers"]) {
    assert.ok(files.includes(name), `${name} is published`);
  }
  assert.ok(fs.existsSync(path.join(dist, "fonts", "geist-latin.woff2")), "the font is published");
  assert.ok(fs.existsSync(path.join(dist, "fonts", "LICENSE-Geist.txt")), "the font licence travels with it");

  // Nothing private or server-only is published.
  for (const name of ["server", "tests", ".env", "data", "node_modules", "package.json", "signin.html", "account.html", "emergency.html", "trips.html"]) {
    assert.ok(!files.includes(name), `${name} is not published`);
  }

  // Accounts and server features are switched off in the published settings.
  const sandbox = {};
  new Function("window", fs.readFileSync(path.join(dist, "config.js"), "utf8"))(sandbox);
  assert.equal(sandbox.SAFE_LOCATION_CONFIG.sync, false);

  // Every page that needs the server leads to the landing page instead of a broken page.
  const redirects = fs.readFileSync(path.join(dist, "_redirects"), "utf8");
  for (const page of SERVER_PAGES) assert.match(redirects, new RegExp(`^${page}\\s+/welcome\\s+302$`, "m"));
});

test("the Netlify site sends the same Content-Security-Policy as the server", () => {
  const serverSource = fs.readFileSync(path.join(root, "server", "app.js"), "utf8");
  const block = serverSource.match(/const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join\("; "\)/);
  assert.ok(block, "server/app.js still defines CONTENT_SECURITY_POLICY");
  const serverPolicy = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("; ");
  assert.equal(CONTENT_SECURITY_POLICY, serverPolicy);
  assert.ok(fs.readFileSync(path.join(root, "dist", "_headers"), "utf8").includes(`Content-Security-Policy: ${serverPolicy}`));
});
