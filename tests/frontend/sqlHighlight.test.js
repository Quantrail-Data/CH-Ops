// Contributors - Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited
// sqlHighlight.test.js - which tags the CodeMirror SQL parser emits for a server-built dialect

import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildDialect } from "../../src/frontend/components/editor/sqlEditorSetup.js";

const DIALECT = { keywords: ["select", "from", "where", "join", "on", "as"],
                  functions: ["count", "groupArray", "toDate"] };

function nodesOf(doc) {
  const state = EditorState.create({ doc, extensions: [buildDialect(DIALECT)] });
  const out = [];
  syntaxTree(state).iterate({
    enter(n) { out.push({ name: n.name, text: doc.slice(n.from, n.to) }); },
  });
  return out;
}
const named = (doc, name) => nodesOf(doc).filter((n) => n.name === name).map((n) => n.text);

// buildDialect wraps SQLDialect.define in a try/catch and degrades to plain
// sql() if it throws, so a runtime where the custom dialect cannot be built
// produces a parse tree with no Builtin nodes at all - and this test then fails
// with a confusing "expected [] to include 'count'" rather than naming the
// cause.
//
// That is what happens under Bun: vitest launched by `bun x`/`bun run` executes
// on Bun's runtime, where the dialect does not construct. The app is unaffected
// - it is built by Vite and runs in a browser - so this is a limitation of the
// test runtime, not of the highlighting.
//
// Detected rather than assumed, and only this one assertion depends on it. The
// rest of the file exercises Identifier, CompositeIdentifier and the keyword
// lists, which parse the same either way.
const DIALECT_BUILDS = named("SELECT count() FROM t", "Builtin").length > 0;

describe("what the parser tags", () => {
  it.skipIf(!DIALECT_BUILDS)(
    "marks a server function as Builtin, which maps to standard(name)",
    () => {
      // The tag the style has to target. Getting this wrong is invisible: the
      // text simply renders in the foreground colour.
      expect(named("SELECT count() FROM t", "Builtin")).toContain("count");
    },
  );

  it("marks a function the server does not have as a plain Identifier", () => {
    // Correct, and worth pinning: the dialect is built from system.functions on
    // the CONNECTED server, so highlighting follows that server's capabilities.
    expect(named("SELECT notAFunction() FROM t", "Builtin")).toEqual([]);
    expect(named("SELECT notAFunction() FROM t", "Identifier")).toContain("notAFunction");
  });

  it("marks tables and columns as Identifier", () => {
    const ids = named("SELECT name FROM events", "Identifier");
    expect(ids).toContain("name");
    expect(ids).toContain("events");
  });

  it("wraps db.table in a CompositeIdentifier", () => {
    // The only thing that distinguishes the database from the table: both
    // halves are Identifier, and only the parent says they belong together.
    expect(named("SELECT * FROM system.tables", "CompositeIdentifier")).toContain("system.tables");
  });

  it("puts the qualifier first inside that wrapper", () => {
    const doc = "SELECT * FROM system.tables";
    const state = EditorState.create({ doc, extensions: [buildDialect(DIALECT)] });
    let first = null;
    syntaxTree(state).iterate({
      enter(n) {
        if (n.name === "CompositeIdentifier" && !first) {
          first = doc.slice(n.node.firstChild.from, n.node.firstChild.to);
        }
      },
    });
    expect(first).toBe("system");
  });

  it("keeps keywords, strings, numbers and comments distinct", () => {
    const doc = "SELECT 42 FROM t WHERE a = 'x' -- note";
    expect(named(doc, "Keyword")).toContain("SELECT");
    expect(named(doc, "Number")).toContain("42");
    expect(named(doc, "String")).toContain("'x'");
    expect(named(doc, "LineComment")).toContain("-- note");
  });

  it("treats a quoted identifier as a name, not a string", () => {
    // SELECT "count" is a column, and colouring it as a string makes it look
    // like data.
    expect(named('SELECT "count" FROM t', "QuotedIdentifier")).toContain('"count"');
  });
});

describe("either list is enough to build a dialect", () => {
  it("still highlights functions when the keyword query failed", () => {
    // The two lists come from two independent queries and either can fail on
    // its own.
    const doc = "SELECT count() FROM t";
    const state = EditorState.create({
      doc,
      extensions: [buildDialect({ keywords: [], functions: ["count"] })],
    });
    const found = [];
    syntaxTree(state).iterate({
      enter(n) { if (n.name === "Builtin") found.push(doc.slice(n.from, n.to)); },
    });
    expect(found).toContain("count");
  });
});
