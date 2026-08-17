// resolveVersion.mjs
// author - rva, jkr
// Resolves the app's build/dev version string
// Used by scripts/generate-version.mjs (bakes the result into a file the
// backend can import, since a compiled binary has no git/checkout at runtime
// on the end user's machine) and directly by vite.config.js

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function git(args) {
  return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

export function resolveVersion() {
  if (process.env.VERSION && process.env.VERSION.trim()) {
    return process.env.VERSION.trim();
  }

  try {
    const branch = git("rev-parse --abbrev-ref HEAD");
    const commit = git("rev-parse --short HEAD");
    if (branch && commit) return `${branch}-${commit}`;
  } catch {
    // Not a git checkout - fall through to the version.json fallback below.
  }

  // Last option: read the app version from version.json
  try {
    const info = JSON.parse(
      readFileSync(fileURLToPath(new URL("../version.json", import.meta.url)), "utf8"),
    );
    if (info.version) return String(info.version);
  } catch {
    // No version.json available - fall through to the default.
  }

  return "unknown";
}
