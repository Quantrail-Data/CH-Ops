// The UI revamp must not change the charts. This test fails when a chart file
// or a chart CSS rule changes.
//
// Charts follow the theme only through CSS variables (colors and font names),
// so no chart file needs a change. If a change is really wanted, get it
// approved, then put the new hash from the failure message in chart-guard.json.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(__dirname, "../..");
const FRONTEND = path.join(ROOT, "src/frontend");
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "chart-guard.json"), "utf8"));

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function listCssFiles(folder) {
  const found = [];
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) found.push(...listCssFiles(full));
    else if (item.name.endsWith(".css")) found.push(full);
  }
  return found;
}

// Every CSS rule with a chart class in its selector, from all CSS files.
// The rules may move to another file; only their text counts.
function readChartRules(cssText) {
  const rules = [];
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{") {
      stack.push({ header: text.slice(start, index).trim(), bodyStart: index + 1 });
      start = index + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (!open) continue;
      const body = text.slice(open.bodyStart, index).trim();
      const isChartRule = /\.chart-|chartTileEnter/.test(open.header);
      // A rule inside @media keeps its @media line, so the context counts too.
      const context = stack.map((item) => item.header).join(" > ");
      if (isChartRule && !body.includes("{")) {
        rules.push(`${context} > ${open.header} { ${body.replace(/\s+/g, " ")} }`);
      } else if (isChartRule && open.header.startsWith("@keyframes")) {
        rules.push(`${open.header} { ${body.replace(/\s+/g, " ")} }`);
      }
      start = index + 1;
    }
  }
  return rules;
}

describe("chart guard", () => {
  for (const [file, hash] of Object.entries(expected.files)) {
    it(`does not change ${file}`, () => {
      const actual = hashText(fs.readFileSync(path.join(ROOT, file), "utf8"));
      expect(actual, `${file} changed. New hash: ${actual}`).toBe(hash);
    });
  }

  it("does not change the chart CSS rules", () => {
    const rules = listCssFiles(FRONTEND).flatMap((file) => readChartRules(fs.readFileSync(file, "utf8")));
    rules.sort();
    const actual = hashText(rules.join("\n"));
    expect(rules.length, "chart CSS rules found").toBe(expected.cssRuleCount);
    expect(actual, `The chart CSS rules changed. New hash: ${actual}`).toBe(expected.cssRulesHash);
  });
});
