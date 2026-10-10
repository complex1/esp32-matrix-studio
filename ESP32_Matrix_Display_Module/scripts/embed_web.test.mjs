import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createHeader, verifyEmbeddedHeader, loadSources, run } from "./embed_web.mjs";

const sources = [
  { name: "asset0", path: "index.html", type: "text/html", source: Buffer.from("<h1>Matrix</h1>\n".repeat(30)) },
  { name: "asset1", path: "nested/controller.mjs", type: "text/javascript", source: Buffer.from("export const colors = [0, 255, 128];\n") },
];
const canonical = createHeader(sources).header;
const replaceBytes = (header, name, bytes) => header.replace(
  new RegExp(`(const uint8_t ${name}\\[\\] PROGMEM = \\{\\n)[\\s\\S]*?(\\n\\};\\n)`),
  (_, open, close) => `${open}  ${Array.from(bytes, byte => `0x${byte.toString(16).padStart(2, "0")}`).join(",")},${close}`,
);

test("accepts alternate valid gzip streams with byte-identical source content", () => {
  assert.equal(verifyEmbeddedHeader(canonical, sources), true);
  const alternate = gzipSync(sources[0].source, { level: 1 });
  // Vary platform metadata too: both gzip OS codes are valid and immaterial.
  alternate[9] = alternate[9] === 3 ? 255 : 3;
  const header = replaceBytes(canonical, "asset0", alternate);
  assert.notEqual(header, canonical);
  assert.equal(verifyEmbeddedHeader(header, sources), true);
});

test("rejects stale, truncated, corrupt and oversized decompressed content", () => {
  const stale = replaceBytes(canonical, "asset0", gzipSync(Buffer.from("old source")));
  assert.equal(verifyEmbeddedHeader(stale, sources), false);
  assert.equal(verifyEmbeddedHeader(canonical, [{ ...sources[0], source: Buffer.from("new source") }, sources[1]]), false);
  const corrupt = gzipSync(sources[0].source);
  corrupt[corrupt.length - 8] ^= 1; // CRC failure must never be accepted.
  assert.equal(verifyEmbeddedHeader(replaceBytes(canonical, "asset0", corrupt), sources), false);
  assert.equal(verifyEmbeddedHeader(replaceBytes(canonical, "asset0", corrupt.subarray(0, 12)), sources), false);
  assert.equal(verifyEmbeddedHeader(replaceBytes(canonical, "asset0", gzipSync(Buffer.alloc(1_000_000))), sources), false);
});

test("rejects missing, extra, duplicate, malformed and renamed arrays", () => {
  const removed = canonical.replace(/const uint8_t asset0\[\] PROGMEM = \{\n[\s\S]*?\n\};\n/, "");
  assert.equal(verifyEmbeddedHeader(removed, sources), false);
  const extra = canonical.replace("struct Asset", "const uint8_t asset2[] PROGMEM = {\n  0x00,\n};\nstruct Asset");
  assert.equal(verifyEmbeddedHeader(extra, sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace("const uint8_t asset1[]", "const uint8_t asset0[]"), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace("const uint8_t asset0[]", "const uint8_t unexpected[]"), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace("0x1f,", "0x1ff,"), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace("0x1f,", "31,"), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace("uint8_t asset0", "uint16_t asset0"), sources), false);
});

test("enforces the exact table count, schema, URL, MIME, name, length and order", () => {
  const mutations = [
    ["\"/index.html\"", "\"/old.html\""],
    ["\"text/html\"", "\"text/plain\""],
    ["asset0, sizeof(asset0)", "asset1, sizeof(asset0)"],
    ["sizeof(asset0)", "sizeof(asset1)"],
    ["sizeof(asset0)", "42"],
    ["size_t length;", "uint16_t length;"],
    ["const Asset assets[]", "Asset assets[]"],
  ];
  for (const [before, after] of mutations) assert.equal(verifyEmbeddedHeader(canonical.replace(before, after), sources), false);
  const row = '  {"/index.html", "text/html", asset0, sizeof(asset0)},\n';
  assert.equal(verifyEmbeddedHeader(canonical.replace(row, ""), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical.replace(row, row + row), sources), false);
  const other = '  {"/nested/controller.mjs", "text/javascript", asset1, sizeof(asset1)},';
  assert.equal(verifyEmbeddedHeader(canonical.replace(row + other, other + "\n" + row.trimEnd()), sources), false);
  assert.equal(verifyEmbeddedHeader(canonical + "// extra declaration\n", sources), false);
});

test("CLI runner retains the stale error and never writes during --check", (context) => {
  const fixture = mkdtempSync(join(tmpdir(), "matrix-embed-check-"));
  context.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, "web"));
  const sourceFile = join(fixture, "web", "index.html");
  const headerFile = join(fixture, "WebAssets.h");
  const projectURL = pathToFileURL(`${fixture}/`);
  const source = Buffer.from("<h1>Current source</h1>\n");
  const stale = Buffer.from("stale embedded header\n");
  writeFileSync(sourceFile, source);
  writeFileSync(headerFile, stale);
  assert.throws(() => run(projectURL, true), {
    message: "WebAssets.h is stale; run node scripts/embed_web.mjs",
  });
  assert.deepEqual(readFileSync(headerFile), stale);
  assert.deepEqual(readFileSync(sourceFile), source);
  const fresh = Buffer.from(createHeader(loadSources(projectURL)).header);
  writeFileSync(headerFile, fresh);
  run(projectURL, true);
  assert.deepEqual(readFileSync(headerFile), fresh);
  assert.deepEqual(readFileSync(sourceFile), source);
  rmSync(headerFile);
  assert.throws(() => run(projectURL, true), {
    message: "WebAssets.h is stale; run node scripts/embed_web.mjs",
  });
});
