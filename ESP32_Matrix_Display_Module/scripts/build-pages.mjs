// Stage only browser assets, never the firmware tree or private configuration.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../web/", import.meta.url));
if (process.argv.length !== 3) throw new Error("Usage: node scripts/build-pages.mjs <empty-output-directory>");
const destination = resolve(process.argv[2]);
const relativeDestination = relative(source, destination);
if (!relativeDestination || (!relativeDestination.startsWith(`..${sep}`) && relativeDestination !== "..")) {
  throw new Error("Output must be outside the web source directory.");
}
if (existsSync(destination) && readdirSync(destination).length) {
  throw new Error("Output directory must be empty; existing files will not be replaced.");
}

const browserExtensions = new Set([
  ".html", ".js", ".mjs", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2",
]);
function discover(folder, prefix = "") {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith(".") || /\.(?:test|spec)\./i.test(entry.name)) return [];
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${prefix}${entry.name}`);
    const asset = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return discover(join(folder, entry.name), `${asset}/`);
    return entry.isFile() && browserExtensions.has(extname(entry.name).toLowerCase()) ? [asset] : [];
  }).sort();
}

const assets = discover(source);
if (!assets.includes("index.html")) throw new Error("No web/index.html found.");
mkdirSync(destination, { recursive: true });
for (const asset of assets) {
  const output = join(destination, asset);
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(join(source, asset), output);
}
console.log(`Staged ${assets.length} static browser files; tests and firmware are excluded.`);
