// Usage: node scripts/bump-version.mjs <x.y.z|patch|minor|major>
// Sets package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json to one new version.
// The new version must be valid semver and greater than the current one.
import { compareSemver, readVersions, SEMVER, writeVersion } from "./version-files.mjs";

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) fail("usage: node scripts/bump-version.mjs <x.y.z|patch|minor|major>");

let versions;
try {
  versions = readVersions();
} catch (error) {
  fail(error.message);
}

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  fail(
    `the version files disagree before the bump (${JSON.stringify(versions)}). Run "npm run version:check" for details.`,
  );
}

const [current] = unique;
if (!SEMVER.test(current)) fail(`current version "${current}" is not x.y.z semver`);

let next;
if (arg === "patch" || arg === "minor" || arg === "major") {
  const [major, minor, patch] = current.split(".").map(Number);
  if (arg === "major") next = `${major + 1}.0.0`;
  else if (arg === "minor") next = `${major}.${minor + 1}.0`;
  else next = `${major}.${minor}.${patch + 1}`;
} else {
  if (!SEMVER.test(arg)) fail(`"${arg}" is not x.y.z semver, patch, minor or major`);
  next = arg;
}

if (compareSemver(next, current) <= 0) {
  fail(`new version ${next} must be greater than the current version ${current}`);
}

writeVersion(next);

// Read back to prove all three files were written.
const after = readVersions();
const bad = Object.entries(after).filter(([, v]) => v !== next);
if (bad.length > 0) fail(`write check failed for: ${bad.map(([f]) => f).join(", ")}`);

console.log(`bump-version: ${current} -> ${next}`);
console.log("  updated package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json");
console.log("  src-tauri/Cargo.lock updates on the next cargo build; commit it with the bump.");
