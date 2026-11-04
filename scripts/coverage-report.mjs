#!/usr/bin/env node
// coverage-report.mjs - Builds a Markdown coverage summary from lcov.info files.
//
// Reads coverage/frontend/lcov.info and every lcov.info under
// coverage/backend/parts/ (scripts/test-backend-coverage.mjs writes one per
// test run). Any of them may be absent. A source file can be in more than one
// backend report, so the reports are merged line by line. It computes overall
// line coverage, and - when run against a PR
// (COVERAGE_BASE_SHA / COVERAGE_HEAD_SHA set) - a per-file "patch coverage"
// table limited to files changed in that diff. Prints Markdown to stdout.
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const FRONTEND_LCOV = 'coverage/frontend/lcov.info';
const BACKEND_PARTS_DIR = 'coverage/backend/parts';

function lcovFiles() {
  const files = [FRONTEND_LCOV];
  if (existsSync(BACKEND_PARTS_DIR)) {
    for (const part of readdirSync(BACKEND_PARTS_DIR)) {
      files.push(join(BACKEND_PARTS_DIR, part, 'lcov.info'));
    }
  }
  return files.filter((file) => existsSync(file));
}

// Adds the DA (line hit) entries of one lcov file to hitsByFile.
// hitsByFile maps a source file to a Map of line number to hit count.
function addLcov(content, hitsByFile) {
  let lineHits = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      const file = line.slice(3).trim();
      if (!hitsByFile.has(file)) hitsByFile.set(file, new Map());
      lineHits = hitsByFile.get(file);
    } else if (line.startsWith('DA:') && lineHits) {
      const [lineNumber, hits] = line.slice(3).split(',');
      const oldHits = lineHits.get(lineNumber) || 0;
      lineHits.set(lineNumber, Math.max(oldHits, parseInt(hits, 10) || 0));
    } else if (line.trim() === 'end_of_record') {
      lineHits = null;
    }
  }
}

function loadAllRecords() {
  const hitsByFile = new Map();
  for (const file of lcovFiles()) {
    addLcov(readFileSync(file, 'utf8'), hitsByFile);
  }
  const records = [];
  for (const [file, lineHits] of hitsByFile) {
    const linesHit = [...lineHits.values()].filter((hits) => hits > 0).length;
    records.push({ file, lf: lineHits.size, lh: linesHit });
  }
  return records;
}

function pct(hit, found) {
  if (!found) return null;
  return (hit / found) * 100;
}

function fmtPct(p) {
  return p === null ? 'n/a' : `${p.toFixed(1)}%`;
}

function changedFiles() {
  const base = process.env.COVERAGE_BASE_SHA;
  const head = process.env.COVERAGE_HEAD_SHA;
  if (!base || !head) return null;
  try {
    const out = execSync(`git diff --name-only ${base} ${head}`, { encoding: 'utf8' });
    return new Set(out.split('\n').map((f) => f.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

function totals(records) {
  return records.reduce(
    (acc, r) => ({ lf: acc.lf + r.lf, lh: acc.lh + r.lh }),
    { lf: 0, lh: 0 },
  );
}

const records = loadAllRecords();

if (records.length === 0) {
  console.log('<!-- coverage-report-bot -->\n## Coverage Report\n\nNo coverage data found.');
  process.exit(0);
}

const overall = totals(records);
let out = '<!-- coverage-report-bot -->\n## Coverage Report\n\n';
out += `**Overall line coverage:** ${fmtPct(pct(overall.lh, overall.lf))} (${overall.lh}/${overall.lf} lines)\n`;

const changed = changedFiles();
if (changed) {
  const changedRecords = records.filter((r) => changed.has(r.file));
  if (changedRecords.length === 0) {
    out += '\n_No changed files in this PR have coverage data (docs/config-only change, or files outside tested source)._\n';
  } else {
    const patch = totals(changedRecords);
    out += `\n**Patch coverage (changed files in this PR):** ${fmtPct(pct(patch.lh, patch.lf))} (${patch.lh}/${patch.lf} lines)\n\n`;
    out += '| File | Coverage | Lines |\n|---|---|---|\n';
    for (const r of changedRecords.sort((a, b) => a.file.localeCompare(b.file))) {
      out += `| ${r.file} | ${fmtPct(pct(r.lh, r.lf))} | ${r.lh}/${r.lf} |\n`;
    }
  }
}

console.log(out);
