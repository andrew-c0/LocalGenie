// Shared reader/writer for the three files that carry the app version.
// Edits are targeted string replacements so formatting and line endings stay untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const FILES = {
  packageJson: join(root, "package.json"),
  cargoToml: join(root, "src-tauri", "Cargo.toml"),
  tauriConf: join(root, "src-tauri", "tauri.conf.json"),
};

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// The [package] table's own version line (not a dependency's version key).
const CARGO_PACKAGE_VERSION = /^(version[ \t]*=[ \t]*")([^"]*)(")/m;
// Top-level "version" of tauri.conf.json: the only key indented exactly two spaces.
const TAURI_TOP_VERSION = /^( {2}"version"[ \t]*:[ \t]*")([^"]*)(")/m;

function readText(path) {
  return readFileSync(path, "utf8");
}

function cargoPackageSection(text) {
  const start = text.search(/^\[package\][ \t]*\r?$/m);
  if (start < 0) throw new Error("no [package] table in Cargo.toml");
  const rest = text.slice(start + 1);
  const next = rest.search(/^\[/m);
  const end = next < 0 ? text.length : start + 1 + next;
  return { start, end };
}

export function readVersions() {
  const pkg = JSON.parse(readText(FILES.packageJson)).version;

  const cargoText = readText(FILES.cargoToml);
  const { start, end } = cargoPackageSection(cargoText);
  const cargoMatch = CARGO_PACKAGE_VERSION.exec(cargoText.slice(start, end));
  if (!cargoMatch) throw new Error("no version in the [package] table of Cargo.toml");
  const cargo = cargoMatch[2];

  const tauriMatch = TAURI_TOP_VERSION.exec(readText(FILES.tauriConf));
  if (!tauriMatch) throw new Error('no top-level "version" in tauri.conf.json');
  const tauri = tauriMatch[2];

  return {
    "package.json": pkg,
    "src-tauri/Cargo.toml": cargo,
    "src-tauri/tauri.conf.json": tauri,
  };
}

export function writeVersion(version) {
  // package.json: only the "version" value at the top level changes.
  const pkgText = readText(FILES.packageJson);
  const pkgNext = pkgText.replace(/^( {2}"version"[ \t]*:[ \t]*")([^"]*)(")/m, `$1${version}$3`);
  writeFileSync(FILES.packageJson, pkgNext);

  const cargoText = readText(FILES.cargoToml);
  const { start, end } = cargoPackageSection(cargoText);
  const section = cargoText.slice(start, end).replace(CARGO_PACKAGE_VERSION, `$1${version}$3`);
  writeFileSync(FILES.cargoToml, cargoText.slice(0, start) + section + cargoText.slice(end));

  const tauriText = readText(FILES.tauriConf);
  writeFileSync(FILES.tauriConf, tauriText.replace(TAURI_TOP_VERSION, `$1${version}$3`));
}

export function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
