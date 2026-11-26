#!/usr/bin/env bun
// release-info.mjs
// Reads version.json and prints the release values for GitHub Actions.
//
// Usage: bun scripts/release-info.mjs <image> [<image> ...] >> "$GITHUB_OUTPUT"
//
// It prints:
//   version      2.0.1
//   channel      beta
//   release_name 2.0.1-beta (no label for stable: 2.0.1)
//   prerelease   true for alpha and beta, false for stable
//   docker_tags  one line for each image and tag, for docker/build-push-action

import { readFileSync } from "node:fs";
import { dockerTags, parseVersionInfo, releaseName } from "../src/shared/version.js";

export function releaseOutputs(info, images) {
  const { version, channel } = parseVersionInfo(info);
  const tagLines = images.flatMap((image) => dockerTags(info).map((tag) => `${image}:${tag}`));
  return [
    `version=${version}`,
    `channel=${channel}`,
    `release_name=${releaseName(info)}`,
    `prerelease=${channel !== "stable"}`,
    "docker_tags<<END_OF_TAGS",
    ...tagLines,
    "END_OF_TAGS",
  ].join("\n");
}

if (import.meta.main) {
  const images = process.argv.slice(2);
  const info = JSON.parse(readFileSync("version.json", "utf8"));
  try {
    console.log(releaseOutputs(info, images));
  } catch (error) {
    console.error(`ERROR: version.json: ${error.message}`);
    process.exit(1);
  }
}
