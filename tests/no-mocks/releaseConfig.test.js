// Checks that the CI workflows, the Kubernetes manifests and version.json
// agree with each other and with the current release.

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../..");
const readRepoFile = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8");
const versionInfo = JSON.parse(readRepoFile("version.json"));

// "2.0.0-beta" is a pre-release. "1.4.1" is a release.
function isPreRelease(version) {
  return version.includes("-");
}

// Compares the X.Y.Z part of two versions. Below 0: a is lower.
function compareReleaseNumbers(a, b) {
  const numbersOf = (version) => version.split("-")[0].split(".").map(Number);
  const [aNumbers, bNumbers] = [numbersOf(a), numbersOf(b)];
  for (let index = 0; index < 3; index++) {
    if (aNumbers[index] !== bNumbers[index]) return aNumbers[index] - bNumbers[index];
  }
  return 0;
}

describe("CI workflows", () => {
  it("use Bun 1.4.4 in every job", () => {
    const workflowDir = path.join(repoRoot, ".github/workflows");
    const workflowNames = fs
      .readdirSync(workflowDir)
      .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));

    const bunVersions = [];
    for (const name of workflowNames) {
      const text = readRepoFile(path.join(".github/workflows", name));
      for (const match of text.matchAll(/bun-version:\s*"?([^"\s]+)"?/g)) {
        bunVersions.push(`${name}: ${match[1]}`);
      }
    }

    expect(bunVersions.length).toBeGreaterThan(0);
    for (const entry of bunVersions) {
      expect(entry.endsWith(": 1.4.4")).toBe(true);
    }
  });
});

describe("Kubernetes manifests", () => {
  const manifestNames = ["statefulset.yaml", "configmap.yaml", "service.yaml", "ingress.yaml"];

  it("do not refer to steps or parts of a guide that is not in the repo", () => {
    for (const name of manifestNames) {
      const text = readRepoFile(name);
      expect(text).not.toMatch(/\b(Step|Part) \d/);
      expect(text).not.toContain("the note below");
    }
  });

  // A pre-release (for example 2.0.0-beta) has no image on Docker Hub yet,
  // so the manifest keeps the last released image until the release.
  it("use a published image: the current version, or the last release before a pre-release", () => {
    const statefulSet = readRepoFile("statefulset.yaml");
    const imageTag = statefulSet.match(/image: quantrailadmin1\/ch-ops:(\S+)\n/)?.[1];
    expect(imageTag).toBeDefined();
    if (isPreRelease(versionInfo.version)) {
      expect(isPreRelease(imageTag)).toBe(false);
      expect(compareReleaseNumbers(imageTag, versionInfo.version)).toBeLessThan(0);
    } else {
      expect(imageTag).toBe(versionInfo.version);
    }
  });
});

describe("version.json", () => {
  it("states the tested ClickHouse versions", () => {
    expect(versionInfo.clickhouseVersion).toBe("26.3 LTS, 26.8 LTS");
    expect(versionInfo.clickhouseCompat).toBe(
      "Older and newer versions should work, but they are not tested.",
    );
  });
});

describe("version helpers of this test", () => {
  it("know a pre-release", () => {
    expect(isPreRelease("2.0.0-beta")).toBe(true);
    expect(isPreRelease("1.4.1")).toBe(false);
  });

  it("compare the numbers, not the text", () => {
    expect(compareReleaseNumbers("1.4.1", "2.0.0-beta")).toBeLessThan(0);
    expect(compareReleaseNumbers("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareReleaseNumbers("2.0.0", "2.0.0-beta")).toBe(0);
  });
});
