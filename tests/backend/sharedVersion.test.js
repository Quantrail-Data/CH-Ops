// sharedVersion.test.js - Unit tests for src/shared/version.js and the two
// scripts that use it: check-version-bump.mjs and release-info.mjs.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, expect, it } from "bun:test";
import {
  compareVersions,
  dockerTags,
  formatVersion,
  parseVersionInfo,
  releaseName,
} from "../../src/shared/version.js";
import { findVersionProblems, readOldForm } from "../../scripts/check-version-bump.mjs";
import { releaseOutputs } from "../../scripts/release-info.mjs";

const beta = (version) => ({ version, channel: "beta" });
const stable = (version) => ({ version, channel: "stable" });

describe("parseVersionInfo", () => {
  it("reads the version, the channel and the numbers", () => {
    expect(parseVersionInfo({ version: "2.10.3", channel: "alpha" })).toEqual({
      version: "2.10.3",
      channel: "alpha",
      numbers: [2, 10, 3],
    });
  });

  it("refuses a version that is not MAJOR.MINOR.BUGFIX", () => {
    for (const version of ["2.0", "2.0.0-beta", "v2.0.0", "2.0.0.1", "", undefined]) {
      expect(() => parseVersionInfo({ version, channel: "beta" })).toThrow("must be MAJOR.MINOR.BUGFIX");
    }
  });

  it("refuses an unknown channel", () => {
    for (const channel of ["rc", "Beta", "", undefined]) {
      expect(() => parseVersionInfo({ version: "2.0.0", channel })).toThrow("must be one of: alpha, beta, stable");
    }
  });
});

describe("compareVersions", () => {
  it("compares the numbers, not the text", () => {
    expect(compareVersions(stable("1.10.0"), stable("1.9.0"))).toBeGreaterThan(0);
    expect(compareVersions(stable("1.4.1"), beta("2.0.0"))).toBeLessThan(0);
    expect(compareVersions(beta("1.1.4"), stable("1.1.3"))).toBeGreaterThan(0);
  });

  it("puts alpha before beta, and beta before stable, for the same numbers", () => {
    expect(compareVersions({ version: "2.0.0", channel: "alpha" }, beta("2.0.0"))).toBeLessThan(0);
    expect(compareVersions(beta("2.0.0"), stable("2.0.0"))).toBeLessThan(0);
    expect(compareVersions(beta("2.0.0"), beta("2.0.0"))).toBe(0);
  });
});

describe("formatVersion", () => {
  it("adds the channel after the version", () => {
    expect(formatVersion("1.1.3", "stable")).toBe("1.1.3 - stable");
    expect(formatVersion("testing-1fbaae8", "beta")).toBe("testing-1fbaae8 - beta");
  });

  it("gives only the version when there is no channel", () => {
    expect(formatVersion("1.4.1", undefined)).toBe("1.4.1");
  });
});

describe("releaseName and dockerTags", () => {
  it("give a stable release no label, and move latest", () => {
    expect(releaseName(stable("2.1.3"))).toBe("2.1.3");
    expect(dockerTags(stable("2.1.3"))).toEqual(["2.1.3", "2.1", "2", "latest"]);
  });

  it("give an alpha or beta release its label, and never move latest", () => {
    expect(releaseName(beta("2.1.4"))).toBe("2.1.4-beta");
    expect(dockerTags(beta("2.1.4"))).toEqual(["2.1.4-beta", "beta"]);
    expect(dockerTags({ version: "2.2.0", channel: "alpha" })).toEqual(["2.2.0-alpha", "alpha"]);
  });
});

describe("check-version-bump.mjs", () => {
  it("reads the old form of main, 2.0.0-beta, as version 2.0.0 and channel beta", () => {
    expect(readOldForm({ version: "2.0.0-beta" })).toMatchObject(beta("2.0.0"));
    expect(readOldForm({ version: "1.4.1" })).toMatchObject(stable("1.4.1"));
    expect(readOldForm(beta("2.0.1"))).toEqual(beta("2.0.1"));
  });

  it("accepts a newer version", () => {
    expect(findVersionProblems(stable("1.1.3"), beta("1.1.4"))).toEqual([]);
    expect(findVersionProblems(beta("2.0.0"), stable("2.0.0"))).toEqual([]);
    expect(findVersionProblems({ version: "2.0.0-beta" }, beta("2.0.1"))).toEqual([]);
  });

  it("refuses the same version or an older version", () => {
    expect(findVersionProblems(beta("2.0.0"), beta("2.0.0"))).toEqual([
      "version.json must have a newer version than main. main has 2.0.0 - beta, this pull request has 2.0.0 - beta.",
    ]);
    expect(findVersionProblems({ version: "2.0.0-beta" }, beta("2.0.0"))).toHaveLength(1);
    expect(findVersionProblems(stable("2.0.0"), beta("2.0.0"))).toHaveLength(1);
    expect(findVersionProblems(stable("2.1.0"), stable("2.0.9"))).toHaveLength(1);
  });

  it("refuses a version.json that is not valid", () => {
    expect(findVersionProblems(stable("1.0.0"), { version: "2.0.0-beta" })[0]).toContain(
      "version.json of this pull request: version",
    );
  });

  it("accepts any valid version when main has no version that it can read", () => {
    expect(findVersionProblems({}, beta("0.0.1"))).toEqual([]);
  });
});

describe("release-info.mjs", () => {
  it("prints the outputs of a beta release for GitHub Actions", () => {
    expect(releaseOutputs(beta("2.0.1"), ["ghcr.io/org/app", "user/app"])).toBe(
      [
        "version=2.0.1",
        "channel=beta",
        "release_name=2.0.1-beta",
        "prerelease=true",
        "docker_tags<<END_OF_TAGS",
        "ghcr.io/org/app:2.0.1-beta",
        "ghcr.io/org/app:beta",
        "user/app:2.0.1-beta",
        "user/app:beta",
        "END_OF_TAGS",
      ].join("\n"),
    );
  });

  it("marks a stable release as not a pre-release", () => {
    const output = releaseOutputs(stable("2.0.1"), ["user/app"]);
    expect(output).toContain("release_name=2.0.1\n");
    expect(output).toContain("prerelease=false");
    expect(output).toContain("user/app:latest");
  });
});
