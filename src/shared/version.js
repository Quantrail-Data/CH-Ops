// version.js - reads and compares the CHOps version in version.json.
//
// version.json has two fields for the release:
//   "version": "MAJOR.MINOR.BUGFIX", for example "2.0.1"
//   "channel": "alpha", "beta" or "stable"
//
// The app shows them as "2.0.1 - beta". The CI check, the release pipeline,
// the backend and the frontend build all use this file, so the rules are the same.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

// From the least ready to the most ready.
export const CHANNELS = ["alpha", "beta", "stable"];

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

// Gives { version, channel, numbers } or throws an error that tells what to fix.
export function parseVersionInfo(info) {
  const version = String(info?.version ?? "");
  const channel = String(info?.channel ?? "");

  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`version "${version}" must be MAJOR.MINOR.BUGFIX, for example 2.0.1`);
  }
  if (!CHANNELS.includes(channel)) {
    throw new Error(`channel "${channel}" must be one of: ${CHANNELS.join(", ")}`);
  }

  return { version, channel, numbers: match.slice(1).map(Number) };
}

// Below 0: a is older than b. 0: the same. Above 0: a is newer.
// The numbers come first. For the same numbers, stable is newer than beta,
// and beta is newer than alpha.
export function compareVersions(a, b) {
  const first = parseVersionInfo(a);
  const second = parseVersionInfo(b);
  for (let index = 0; index < 3; index++) {
    const difference = first.numbers[index] - second.numbers[index];
    if (difference !== 0) return difference;
  }
  return CHANNELS.indexOf(first.channel) - CHANNELS.indexOf(second.channel);
}

// The text that the app shows, for example "2.0.1 - beta".
// In development the version is "branch-commit", and that is shown the same way.
export function formatVersion(version, channel) {
  if (!channel) return String(version);
  return `${version} - ${channel}`;
}

// The name of the git tag and of the Docker image tag of a release.
// A stable release has no label: "2.0.1". Other channels have one: "2.0.1-beta".
export function releaseName(info) {
  const { version, channel } = parseVersionInfo(info);
  return channel === "stable" ? version : `${version}-${channel}`;
}

// The Docker image tags of a release.
// Only a stable release moves "latest", "2.0" and "2". An alpha or beta
// release gets its own tag and moves "alpha" or "beta".
export function dockerTags(info) {
  const { version, channel, numbers } = parseVersionInfo(info);
  if (channel === "stable") {
    return [version, `${numbers[0]}.${numbers[1]}`, `${numbers[0]}`, "latest"];
  }
  return [`${version}-${channel}`, channel];
}
