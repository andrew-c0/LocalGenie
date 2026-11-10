// Serves a local update feed for testing the in-app updater: node scripts/updater-test/serve-feed.mjs
// It reads the newest installer and its .sig from the debug NSIS bundle folder, writes latest.json for
// it on the fly, and serves both on http://127.0.0.1:8765. Stop it with Ctrl+C.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundleDir = join(root, "src-tauri", "target", "debug", "bundle", "nsis");
const PORT = 8765;

const installers = readdirSync(bundleDir)
  .filter((name) => /^LocalGenie_\d+\.\d+\.\d+_arm64-setup\.exe$/.test(name))
  .sort((a, b) => statSync(join(bundleDir, b)).mtimeMs - statSync(join(bundleDir, a)).mtimeMs);
if (installers.length === 0) throw new Error(`No installer found in ${bundleDir}`);

const installer = installers[0];
const version = installer.match(/_(\d+\.\d+\.\d+)_/)[1];
const signature = readFileSync(join(bundleDir, `${installer}.sig`), "utf8").trim();
const feed = JSON.stringify({
  version,
  notes: `Local test update ${version}.`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-aarch64": { signature, url: `http://127.0.0.1:${PORT}/${installer}` },
  },
});

createServer((req, res) => {
  console.log(new Date().toISOString(), req.method, req.url);
  if (req.url === "/latest.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(feed);
  } else if (req.url === `/${installer}`) {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(readFileSync(join(bundleDir, installer)));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Serving ${installer} (version ${version}) on port ${PORT}`),
);
