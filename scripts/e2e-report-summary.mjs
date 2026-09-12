#!/usr/bin/env node
// e2e-report-summary.mjs - Builds a Markdown summary of a Playwright JSON
// report for the GitHub Actions job summary ($GITHUB_STEP_SUMMARY).
//
// Usage: node scripts/e2e-report-summary.mjs [path/to/results.json]
// Defaults to playwright-report/results.json (see playwright.config.js's
// json reporter). Prints Markdown to stdout; the caller redirects it.
import { existsSync, readFileSync } from 'fs';

const reportPath = process.argv[2] || 'playwright-report/results.json';

if (!existsSync(reportPath)) {
  console.log('## 🎭 Playwright E2E Report\n\nNo report found - the run may have crashed before any test finished.');
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// Error messages come through with terminal color codes (Playwright colors
// its own CLI output); GitHub's summary renderer doesn't interpret ANSI, so
// left in they'd show up as literal escape-code gibberish in the table.
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function statusEmoji(status) {
  if (status === 'expected') return '✅';
  if (status === 'flaky') return '⚠️';
  if (status === 'skipped') return '⏭️';
  return '❌';
}

// Specs live at every suite level: file-level suites hold specs directly
// (e.g. login.spec.js has no describe block) while describe-wrapped files
// nest an inner suite (title = describe name) one level down.
function collectSpecs(suite, fileTitle, out) {
  const file = fileTitle || suite.title;
  for (const spec of suite.specs || []) {
    // One entry per project the spec ran under (just "chromium" here, plus
    // "setup" for auth.setup.js), each carrying its own retries/status.
    for (const test of spec.tests || []) {
      const lastResult = test.results[test.results.length - 1];
      out.push({
        file,
        title: spec.title,
        status: test.status,
        retries: test.results.length - 1,
        durationMs: test.results.reduce((sum, r) => sum + r.duration, 0),
        error: lastResult?.errors?.[0]?.message,
      });
    }
  }
  for (const nested of suite.suites || []) {
    collectSpecs(nested, file, out);
  }
}

const specs = [];
for (const suite of report.suites || []) {
  collectSpecs(suite, null, specs);
}

const { expected = 0, unexpected = 0, skipped = 0, flaky = 0, duration = 0 } = report.stats || {};
const total = expected + unexpected + skipped + flaky;

let out = '## 🎭 Playwright E2E Report\n\n';
out += `${unexpected > 0 ? '❌' : '✅'} **${expected} passed**, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped `;
out += `(${total} total, ${(duration / 1000).toFixed(1)}s)\n\n`;

const failures = specs.filter((s) => s.status === 'unexpected' || s.status === 'flaky');
if (failures.length > 0) {
  out += '<details open>\n<summary><strong>Failed / flaky tests</strong></summary>\n\n';
  out += '| | File | Test | Retries | Error |\n|---|---|---|---|---|\n';
  for (const f of failures) {
    // Table cells can't contain raw newlines or unescaped pipes/backslashes.
    // Backslashes must be escaped first, otherwise a message ending in a
    // backslash would escape the pipe-escaping backslash we add next.
    const msg = stripAnsi(f.error || '')
      .split('\n')[0]
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .slice(0, 200);
    out += `| ${statusEmoji(f.status)} | \`${f.file}\` | ${f.title} | ${f.retries} | ${msg ? `\`${msg}\`` : '-'} |\n`;
  }
  out += '\n</details>\n\n';
}

out += '_Full HTML report with traces and screenshots is attached as the `playwright-report` workflow artifact._\n';

console.log(out);
