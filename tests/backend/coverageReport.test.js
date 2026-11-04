// Tests for scripts/coverage-report.mjs.
// The backend coverage run writes one lcov.info per test run. The report must
// read all of them and merge them line by line.

import { describe, it, expect, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const reportScript = path.resolve(import.meta.dir, "../../scripts/coverage-report.mjs");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-coverage-report-"));

function writeLcov(relativePath, content) {
  const file = path.join(workDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function runReport() {
  const run = Bun.spawnSync(["node", reportScript], { cwd: workDir });
  return run.stdout.toString();
}

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("coverage-report.mjs", () => {
  it("merges the backend parts line by line and adds the frontend report", () => {
    writeLcov(
      "coverage/backend/parts/0/lcov.info",
      "TN:\nSF:src/backend/a.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n",
    );
    writeLcov(
      "coverage/backend/parts/1/lcov.info",
      "TN:\nSF:src/backend/a.js\nDA:1,0\nDA:2,3\nLF:2\nLH:1\nend_of_record\n",
    );
    writeLcov(
      "coverage/frontend/lcov.info",
      "TN:\nSF:src/frontend/b.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n",
    );

    const report = runReport();

    expect(report).toContain("**Overall line coverage:** 75.0% (3/4 lines)");
  });
});
