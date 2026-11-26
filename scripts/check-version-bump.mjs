#!/usr/bin/env bun
// check-version-bump.mjs
// Makes sure that a pull request to main changes version.json to a newer version.
//
// Usage: bun scripts/check-version-bump.mjs <version.json of main> [<version.json of the pull request>]
//
// The CI workflow version-check.yml runs it. It also works on your computer:
//   git show origin/main:version.json > /tmp/main-version.json
//   bun scripts/check-version-bump.mjs /tmp/main-version.json

import { readFileSync } from "node:fs";
import { compareVersions, formatVersion, parseVersionInfo } from "../src/shared/version.js";

// Before the "channel" field, version.json had "2.0.0-beta" in one field.
// main can still have that old form, so read it as version 2.0.0, channel beta.
export function readOldForm(info) {
  if (info?.channel) return info;
  const [version, label] = String(info?.version ?? "").split("-");
  return { ...info, version, channel: label || "stable" };
}

// Gives a list of problems. An empty list means the pull request can merge.
export function findVersionProblems(mainInfo, pullRequestInfo) {
  try {
    parseVersionInfo(pullRequestInfo);
  } catch (error) {
    return [`version.json of this pull request: ${error.message}`];
  }

  const mainVersion = readOldForm(mainInfo);
  try {
    parseVersionInfo(mainVersion);
  } catch {
    // main has no version that we can read. Any valid version is newer.
    return [];
  }

  if (compareVersions(pullRequestInfo, mainVersion) > 0) return [];

  const mainText = formatVersion(mainVersion.version, mainVersion.channel);
  const newText = formatVersion(pullRequestInfo.version, pullRequestInfo.channel);
  return [
    `version.json must have a newer version than main. main has ${mainText}, this pull request has ${newText}.`,
  ];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

if (import.meta.main) {
  const [mainPath, pullRequestPath = "version.json"] = process.argv.slice(2);
  if (!mainPath) {
    console.error("Usage: bun scripts/check-version-bump.mjs <version.json of main> [<version.json of the pull request>]");
    process.exit(2);
  }

  const pullRequestInfo = readJson(pullRequestPath);
  const problems = findVersionProblems(readJson(mainPath), pullRequestInfo);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`ERROR: ${problem}`);
    console.error("Change version.json, for example increase the bugfix number, then push again.");
    process.exit(1);
  }
  console.log(`version.json is OK: ${formatVersion(pullRequestInfo.version, pullRequestInfo.channel)}`);
}
