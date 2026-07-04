// schema-studio-ui.test.js - Wiring checks for the Schema Studio steps
//
// These read the component source and assert that the column modifiers, the
// table clauses, and the deterministic generate flow are wired through, so a
// future edit that drops a field is caught. The composing logic itself is
// covered by schema-studio-ddl.test.js and schema-studio-engine.test.js.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect } from "vitest";
import fs from "fs";

const read = (f) => fs.readFileSync(f, "utf8");
const DIR = "src/frontend/components/schema-studio";

describe("StepSchema: per-column modifiers", () => {
  const code = read(`${DIR}/StepSchema.jsx`);
  it("sets every composer-consumed modifier field", () => {
    for (const field of ["nullability", "defaultKind", "defaultExpr", "codec", "statistics", "ttl", "comment", "settings", "primaryKey"]) {
      expect(code).toContain(field);
    }
  });
  it("offers the four default kinds and codec suggestions", () => {
    expect(code).toContain("DEFAULT_KINDS");
    expect(code).toContain("studio-codec-suggestions");
  });
  it("uses FieldLabel tooltips and an expandable panel", () => {
    expect(code).toContain("FieldLabel");
    expect(code).toContain("studio-col-detail");
  });
  it("adds derived columns as new custom columns, not as a kind on inferred ones", () => {
    expect(code).toContain("addCustom");
    expect(code).toContain("Add derived column");
    expect(code).toContain("c.custom");
  });
  it("renders the remove-column button in red (danger styling)", () => {
    const idx = code.indexOf("Remove column");
    expect(idx).toBeGreaterThan(-1);
    const buttonOpen = code.slice(Math.max(0, idx - 200), idx);
    expect(buttonOpen).toContain("studio-danger-btn");
  });
});

describe("StepEngine: table clauses", () => {
  const code = read(`${DIR}/StepEngine.jsx`);
  it("wires every clause field", () => {
    for (const field of ["orderBy", "primaryKey", "partitionBy", "sampleBy", "tableTtl", "tableSettings", "onCluster"]) {
      expect(code).toContain(field);
    }
  });
  it("uses the ordered KeyInput picker for ORDER BY and PRIMARY KEY", () => {
    expect(code).toContain("KeyInput");
    expect(code).toContain('id="studio-orderby"');
    expect(code).toContain('id="studio-primarykey"');
    expect(code).toContain("columns={colNames}");
  });
  it("uses FieldLabel tooltips", () => {
    expect(code).toContain("FieldLabel");
  });
  it("wires repeatable index and projection builders", () => {
    for (const fn of ["addIndex", "updateIndex", "removeIndex", "addProjection", "updateProjection", "removeProjection"]) {
      expect(code).toContain(fn);
    }
    expect(code).toContain("SKIP_INDEX_TYPES");
  });
  it("uses the full-width card layout (no cramped horizontal rows)", () => {
    expect(code).toContain("studio-builder-item");
    expect(code).toContain("form-textarea");
    expect(code).not.toContain("studio-idx-row");
  });
});

describe("StepGenerate: deterministic compose + AI evaluate", () => {
  const code = read(`${DIR}/StepGenerate.jsx`);
  it("composes the DDL deterministically and validates the spec", () => {
    expect(code).toContain("composeCreateTable");
    expect(code).toContain("validateSpec");
  });
  it("maps all column modifiers into the spec", () => {
    for (const field of ["defaultKind", "codec", "statistics", "primaryKey", "settings"]) {
      expect(code).toContain(field);
    }
  });
  it("uses AI only for evaluation, not authoring", () => {
    expect(code).toContain("evaluate");
    expect(code).toContain("Evaluate with AI");
    expect(code).not.toContain("Generate with AI");
  });
  it("shows create errors inside the confirm modal, not behind it", () => {
    expect(code).toContain("createError");
    expect(code).toContain("studio-modal-error");
    // the create handler routes its failure to the modal error, not the banner
    expect(code).toContain("setCreateError(e.message)");
  });
});

describe("KeyInput", () => {
  const code = read(`${DIR}/KeyInput.jsx`);
  it("serializes ordered tokens via joinKey and parses via keyList", () => {
    expect(code).toContain("joinKey");
    expect(code).toContain("keyList");
  });
  it("supports reordering (ordinal position) and free expressions", () => {
    expect(code).toContain("move(i,");
    expect(code).toContain("studio-key-pos");
    expect(code).toContain("Use expression");
  });
});

describe("FieldLabel", () => {
  const code = read(`${DIR}/FieldLabel.jsx`);
  it("renders the label text and an info tooltip from tip", () => {
    expect(code).toContain("studio-tip-bubble");
    expect(code).toContain("ti-info-circle");
  });
});
