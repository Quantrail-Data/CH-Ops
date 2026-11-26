// Checks that the CI workflows, the Kubernetes manifests and version.json
// agree with each other and with the current release.

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { compareVersions, parseVersionInfo } from "../../src/shared/version.js";

const repoRoot = path.resolve(import.meta.dir, "../..");
const readRepoFile = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8");
const versionInfo = JSON.parse(readRepoFile("version.json"));

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

  // An alpha or beta version (for example 2.0.0 beta) has no image on Docker Hub
  // before its release, so the manifest keeps the last stable image until then.
  it("use a published image: the current stable version, or an older stable version", () => {
    const statefulSet = readRepoFile("statefulset.yaml");
    const imageTag = statefulSet.match(/image: quantrailadmin1\/ch-ops:(\S+)\n/)?.[1];
    expect(imageTag).toBeDefined();
    const imageInfo = { version: imageTag, channel: "stable" };
    if (versionInfo.channel === "stable") {
      expect(imageTag).toBe(versionInfo.version);
    } else {
      expect(compareVersions(imageInfo, versionInfo)).toBeLessThan(0);
    }
  });
});

describe("version.json", () => {
  it("has a MAJOR.MINOR.BUGFIX version and a channel", () => {
    expect(() => parseVersionInfo(versionInfo)).not.toThrow();
  });

  it("states the tested ClickHouse versions", () => {
    expect(versionInfo.clickhouseVersion).toBe("26.3 LTS, 26.8 LTS");
    expect(versionInfo.clickhouseCompat).toBe(
      "Older and newer versions should work, but they are not tested.",
    );
  });
});
