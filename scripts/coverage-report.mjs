#!/usr/bin/env node
// coverage-report.mjs - Builds a Markdown coverage summary from lcov.info files.
//
// Reads coverage/backend/lcov.info and coverage/frontend/lcov.info (either may
// be absent), computes overall line coverage, and - when run against a PR
// (COVERAGE_BASE_SHA / COVERAGE_HEAD_SHA set) - a per-file "patch coverage"
// table limited to files changed in that diff. Prints Markdown to stdout.
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const LCOV_FILES = ['coverage/backend/lcov.info', 'coverage/frontend/lcov.info'];

function parseLcov(content) {
  const records = [];
  let cur = null;
  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      cur = { file: line.slice(3).trim(), lf: 0, lh: 0 };
    } else if (line.startsWith('LF:')) {
      cur.lf = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('LH:')) {
      cur.lh = parseInt(line.slice(3), 10) || 0;
    } else if (line.trim() === 'end_of_record') {
      if (cur) records.push(cur);
      cur = null;
    }
  }
  return records;
}

function loadAllRecords() {
  const records = [];
  for (const path of LCOV_FILES) {
    if (!existsSync(path)) continue;
    records.push(...parseLcov(readFileSync(path, 'utf8')));
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
  console.log('<!-- coverage-report-bot -->\n## 📊 Coverage Report\n\nNo coverage data found.');
  process.exit(0);
}

const overall = totals(records);
let out = '<!-- coverage-report-bot -->\n## 📊 Coverage Report\n\n';
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
