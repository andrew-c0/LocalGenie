// Usage: node scripts/check-version.mjs [vX.Y.Z]
// Exits 1 when package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json disagree,
// when a version is not semver, or when a given tag does not match those versions.
import { readVersions, SEMVER } from "./version-files.mjs";

function fail(message) {
  console.error(`check-version: ${message}`);
  process.exit(1);
}

const tagArg = process.argv[2];

let versions;
try {
  versions = readVersions();
} catch (error) {
  fail(error.message);
}

for (const [file, version] of Object.entries(versions)) {
  if (!SEMVER.test(version)) fail(`${file} has a version that is not x.y.z semver: "${version}"`);
}

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  const lines = Object.entries(versions).map(([file, v]) => `  ${file}: ${v}`);
  fail(
    `the version files disagree:\n${lines.join("\n")}\nRun "npm run version:bump -- <x.y.z|patch|minor|major>" to set them together.`,
  );
}

const [version] = unique;

if (tagArg !== undefined) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tagArg);
  if (!match) fail(`tag "${tagArg}" must look like vX.Y.Z`);
  if (match[1] !== version) {
    fail(
      `tag ${tagArg} does not match the app version ${version}. Bump the version or push the right tag.`,
    );
  }
  console.log(`check-version: tag ${tagArg} matches the app version ${version}.`);
} else {
  console.log(`check-version: all three version files are ${version}.`);
}
