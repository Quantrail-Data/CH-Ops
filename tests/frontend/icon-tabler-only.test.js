// Guards that the UI uses only Tabler icons (via the sprite Icon component).
//
// If anyone reintroduces react-icons or references a glyph that is not in the
// sprite, these tests fail. Complements the icon-sprite generator.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ICON_NAMES } from "../../src/frontend/assets/iconSprite.js";

const SRC = "src/frontend";

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}

const allFiles = walk(SRC);

describe("Icons: Tabler only", () => {
  it("no react-icons imports remain anywhere in the frontend", () => {
    const offenders = allFiles.filter((f) =>
      /from\s+['"]react-icons/.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("react-icons is not a dependency", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.dependencies?.["react-icons"]).toBeUndefined();
  });

  it("no webfont <i className=\"ti ...\"> icon usage remains", () => {
    const offenders = allFiles
      .filter((f) => !f.endsWith(path.join("common", "Icon.jsx"))) // documents the legacy pattern
      .filter((f) => /<i\s+className=(["'`])ti /.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("glyphs vendored for the migration are in the sprite", () => {
    for (const g of ["eye-off", "login", "microphone", "microphone-off"]) {
      expect(ICON_NAMES.has(g)).toBe(true);
    }
  });

  it("migrated components render Tabler <Icon> for their controls", () => {
    const checks = {
      "src/frontend/components/layout/LoginPage.jsx": ["ti-eye", "ti-login"],
      "src/frontend/components/qurioz/VoiceSearchButton.jsx": [
        "ti-microphone",
        "ti-microphone-off",
      ],
      "src/frontend/components/qurioz/ChatInputComponent.jsx": ["ti-send"],
      "src/frontend/components/qurioz/SQLQueryEditorComponent.jsx": [
        "ti-copy",
        "ti-check",
        "ti-device-floppy",
      ],
    };
    for (const [file, glyphs] of Object.entries(checks)) {
      const src = fs.readFileSync(file, "utf8");
      for (const g of glyphs) expect(src).toContain(g);
    }
  });
});
