// resolveVersion.mjs
//
// Resolves the app's build/dev version string, in priority order:
//   1. An explicit VERSION env var (e.g. `VERSION=1.2.3 bun run build:standalone:mac`,
//      or set by the release pipeline from the git tag).
//   2. `{branch}-{shortCommit}` from the current git checkout, so a dev build
//      or a local binary build can be traced back to exactly what it was
//      built from.
//   3. "unknown" if neither is available (e.g. building from a source
//      tarball with no .git directory).
//
// Used by scripts/generate-version.mjs (bakes the result into a file the
// backend can import, since a compiled binary has no git/checkout at runtime
// on the end user's machine) and directly by vite.config.js (which only ever
// runs in a real dev/build environment, so it's safe to call this live).
import { execSync } from "node:child_process";

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
    // Not a git checkout - fall through to the last-resort default.
  }

  return "unknown";
}
