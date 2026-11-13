// Cut a release: node scripts/release.mjs <x.y.z|patch|minor|major> [--dry-run]
// Checks the tree is clean and on main, bumps the version files, refreshes Cargo.lock, commits, pushes,
// then tags vX.Y.Z and pushes the tag (which starts the Release workflow). Stops at the first failure.
// --dry-run runs the checks and prints the plan without changing anything.
import { execFileSync } from "node:child_process";
import { readVersions } from "./version-files.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = args.find((a) => !a.startsWith("--"));
const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  console.log(`> ${command} ${commandArgs.join(" ")}`);
  return execFileSync(command, commandArgs, {
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: isWindows && command === "npm",
    ...options.exec,
  });
}

if (!bump) fail("usage: node scripts/release.mjs <x.y.z|patch|minor|major> [--dry-run]");

const branch = run("git", ["branch", "--show-current"], { capture: true }).trim();
if (branch !== "main") fail(`releases are cut from main, you are on "${branch}"`);

const dirty = run("git", ["status", "--porcelain"], { capture: true }).trim();
if (dirty) fail(`the working tree is not clean:\n${dirty}`);

run("git", ["fetch", "origin", "main"]);
const behind = run("git", ["rev-list", "--count", "HEAD..origin/main"], { capture: true }).trim();
if (behind !== "0") fail(`main is ${behind} commit(s) behind origin/main, pull first`);

const current = Object.values(readVersions())[0];
if (dryRun) {
  console.log(`release: dry run OK (current version ${current}, bump "${bump}"). Nothing changed.`);
  process.exit(0);
}

run("npm", ["run", "version:bump", "--", bump]);
const next = Object.values(readVersions())[0];
const tag = `v${next}`;
const existing = run("git", ["tag", "--list", tag], { capture: true }).trim();
if (existing) fail(`tag ${tag} already exists; version files were bumped, revert them if needed`);

run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml"]);
run("npm", ["run", "version:check"]);
run("git", [
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
]);
run("git", ["commit", "-m", `Release ${next}`]);
run("git", ["push"]);
run("git", ["tag", tag]);
run("git", ["push", "origin", tag]);

console.log(
  `\nrelease: ${tag} pushed. Follow the Release run in the Actions tab, edit the notes of the draft release, then publish it (the Release notes workflow copies them into latest.json).`,
);
