// Copy a release's page text into its latest.json "notes" (what the app's update dialog shows).
// Usage: node scripts/release-notes.mjs <x.y.z>
// Edit the notes on the GitHub release page first, then run this. Works on a draft or a published
// release. The signature in latest.json covers the installer, not the notes, so it stays valid.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: node scripts/release-notes.mjs <x.y.z>");
  process.exit(1);
}
const tag = `v${version}`;
const gh = (args) =>
  execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const body = gh(["release", "view", tag, "--json", "body", "--jq", ".body"])
  .replace(/\r\n/g, "\n")
  .trim();
if (!body || /TODO \(placeholder\)/.test(body)) {
  console.error(
    `release-notes: the notes of ${tag} are empty or still the placeholder. Edit the release page first.`,
  );
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "release-notes-"));
gh(["release", "download", tag, "-p", "latest.json", "-D", dir]);
const file = join(dir, "latest.json");
const feed = JSON.parse(readFileSync(file, "utf8"));
feed.notes = body;
writeFileSync(file, JSON.stringify(feed, null, 2));
gh(["release", "upload", tag, file, "--clobber"]);
console.log(
  `release-notes: latest.json of ${tag} now carries the release page notes (${body.length} characters).`,
);
