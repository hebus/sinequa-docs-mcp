// The release archive: an npm package holding only the bundle, with no dependency, so that
// `npx -y <url of the .tgz>` unpacks one file and runs it — nothing to install, nothing to compile.
// Run after `npm run bundle`; writes bundle/sinequa-docs-mcp.tgz (a stable name, for the
// releases/latest/download URL).
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const source = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const out = join(root, "bundle");
const stage = join(out, "package");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
copyFileSync(join(out, "sinequa-docs-mcp.mjs"), join(stage, "sinequa-docs-mcp.mjs"));
copyFileSync(join(root, "LICENSE"), join(stage, "LICENSE"));
const manifest = {
  name: source.name,
  version: source.version,
  description: source.description,
  license: source.license,
  type: "module",
  bin: { [source.name]: "sinequa-docs-mcp.mjs" },
  files: ["sinequa-docs-mcp.mjs", "LICENSE"],
  engines: source.engines,
  repository: source.repository,
};
writeFileSync(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// npm pack names the archive <name>-<version>.tgz; the release asset keeps one name across versions.
// One command string: npm is a .cmd shim on Windows (shell needed), and Node deprecates an argument array with a shell.
const packed = execSync(`npm pack --pack-destination "${out}" --silent`, { cwd: stage, encoding: "utf8" }).trim();
const target = join(out, `${source.name}.tgz`);
renameSync(join(out, packed.split(/\r?\n/).pop()), target);
rmSync(stage, { recursive: true, force: true });
console.log(`${target} (${source.name} ${source.version})`);
