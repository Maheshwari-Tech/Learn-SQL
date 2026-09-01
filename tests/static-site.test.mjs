import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(projectRoot, "sql-patterns-site");

test("keeps browser assets relative so SQL Atlas works behind a route prefix", async () => {
  const html = await readFile(path.join(siteRoot, "index.html"), "utf8");
  const localAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith("#") && !/^https?:\/\//.test(url));

  assert.ok(localAssets.length > 0);
  for (const asset of localAssets) {
    assert.equal(asset.startsWith("/"), false, `${asset} must remain relative`);
    await access(path.join(siteRoot, asset));
  }
});

test("ships the generated problem and pattern catalogs", async () => {
  await access(path.join(siteRoot, "data", "patterns.js"));
  await access(path.join(siteRoot, "data", "problems.js"));
  await access(path.join(siteRoot, "data", "tools.js"));
});

test("canonicalizes the production site with trailing slashes", async () => {
  const configuration = JSON.parse(
    await readFile(path.join(siteRoot, "vercel.json"), "utf8"),
  );

  assert.equal(configuration.trailingSlash, true);
});
