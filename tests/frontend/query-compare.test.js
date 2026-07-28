// query-compare.test.js - the Query Comparison tool: SELECT-only guard, verdict helpers and the shared editing surface
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathirdhasan, Kathir Moorthy, Praveen kumar

import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

import { isSelectOnly, compareMetric, pctDelta } from '../../src/frontend/utils/queryCompare.js';

describe('queryCompare: isSelectOnly', () => {
  it('allows SELECT (any case, leading whitespace)', () => {
    expect(isSelectOnly('SELECT 1')).toBe(true);
    expect(isSelectOnly('  select * from t')).toBe(true);
    expect(isSelectOnly('\n\tSELECT now()')).toBe(true);
  });
  it('allows WITH ... SELECT', () => {
    expect(isSelectOnly('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(isSelectOnly('with cte as (select 1) select 1')).toBe(true);
  });
  it('blocks non-SELECT statements', () => {
    ['INSERT INTO t VALUES (1)', 'DROP TABLE t', 'ALTER TABLE t', 'DELETE FROM t', 'CREATE TABLE t', 'OPTIMIZE TABLE t'].forEach((s) => {
      expect(isSelectOnly(s)).toBe(false);
    });
  });
  it('blocks empty / null', () => {
    expect(isSelectOnly('')).toBe(false);
    expect(isSelectOnly('   ')).toBe(false);
    expect(isSelectOnly(null)).toBe(false);
    expect(isSelectOnly(undefined)).toBe(false);
  });
});

describe('queryCompare: compareMetric (lower is better)', () => {
  it('returns the lower side', () => {
    expect(compareMetric(10, 20)).toBe('a');
    expect(compareMetric(30, 5)).toBe('b');
  });
  it('returns tie on equality', () => {
    expect(compareMetric(7, 7)).toBe('tie');
    expect(compareMetric(0, 0)).toBe('tie');
  });
  it('returns null when a value is missing', () => {
    expect(compareMetric(null, 5)).toBe(null);
    expect(compareMetric(5, null)).toBe(null);
    expect(compareMetric(null, null)).toBe(null);
  });
});

describe('queryCompare: pctDelta', () => {
  it('computes b relative to a', () => {
    expect(pctDelta(100, 50)).toBe(-50);
    expect(pctDelta(100, 150)).toBe(50);
  });
  it('returns null when not computable', () => {
    expect(pctDelta(0, 10)).toBe(null);   // divide by zero base
    expect(pctDelta(null, 10)).toBe(null);
    expect(pctDelta(10, null)).toBe(null);
  });
});

describe('queryCompare: per-user credential threading', () => {
  const code = read('src/frontend/utils/queryCompare.js');
  it('uses the strict editor query path, not the shared runQuery', () => {
    expect(code).toContain("import { runEditorQuery } from \"./api.js\"");
    expect(code).not.toMatch(/import\s*\{[^}]*\brunQuery\b/);
  });
  it('threads creds into estimate, execute, and memory lookup', () => {
    expect(code).toContain('runEstimate(sql, creds)');
    expect(code).toContain('runEditorQuery(sql, creds, { readOnly: true })');
    expect(code).toContain('lookupMemoryUsage(r.queryId, creds)');
  });
  it('executeOne enforces the SELECT-only guard and requires creds', () => {
    expect(code).toContain('export async function executeOne(sql, creds)');
    expect(code).toContain('isSelectOnly(sql)');
    expect(code).toContain('!creds || !creds.user');
  });
  it('shared autocomplete loader runs under creds', () => {
    expect(code).toContain('export async function loadAcWords(creds)');
    expect(code).toContain('system.keywords');
    expect(code).toContain('system.tables');
  });
});

describe('costEstimator: credential-parameter fix', () => {
  const code = read('src/frontend/utils/costEstimator.js');
  it('runEstimate and lookupMemoryUsage declare the creds parameter', () => {
    expect(code).toContain('export async function runEstimate(sql, creds)');
    expect(code).toContain('export async function lookupMemoryUsage(queryId, creds)');
  });
});

describe('SqlEditor: reusable editing surface', () => {
  // SqlInput.jsx is gone. It was the textarea-with-highlight-overlay editor,
  // and its whole approach - the manual highlighter, the acWords autocomplete
  // list, the sql-textarea/sql-highlight layering - went with it when the
  // surface became CodeMirror. What the suite is really asserting is that ONE
  // reusable editing surface is shared rather than duplicated, so these check
  // the component that now plays that role.
  const code = read('src/frontend/components/editor/SqlEditor.jsx');

  it('is controlled and supports running from the editor', () => {
    expect(code).toContain('value = ""');
    expect(code).toContain('onChange');
    expect(code).toContain('onRun');
  });

  it('exposes an imperative handle rather than reaching into the DOM', () => {
    expect(code).toContain('forwardRef');
    expect(code).toContain('useImperativeHandle');
  });

  it('takes its extensions from the shared setup module', () => {
    // Highlighting, completion and the keymap live in one place, so both the
    // editor and the comparison panes get identical behaviour.
    expect(code).toContain('./sqlEditorSetup.js');
    expect(code).toContain('completions');
    expect(code).toContain('dialectData');
  });

  it('is used by both the editor and the comparison view', () => {
    expect(read('src/frontend/components/editor/QueryEditor.jsx')).toContain('SqlEditor');
    expect(read('src/frontend/components/editor/ComparisonView.jsx')).toContain('SqlEditor');
  });
});

describe('ComparisonView: split screen with own per-user connect', () => {
  const code = read('src/frontend/components/editor/ComparisonView.jsx');
  it('has its own connect step validated under editor credentials', () => {
    expect(code).toContain('function handleConnect()');
    expect(code).toContain('runEditorQuery("SELECT 1", candidate)');
    expect(code).toContain('setEditorCreds');
  });
  it('threads per-user creds (via refs) into estimate/execute', () => {
    expect(code).toContain('estimateOne(leftSqlRef.current, credsRef.current)');
    expect(code).toContain('executeOne(leftSqlRef.current, credsRef.current)');
    expect(code).toContain('estimateOne(sql, credsRef.current)');
    expect(code).toContain('executeOne(rightSqlRef.current, credsRef.current)');
  });
  it('loads shared autocomplete words once connected', () => {
    expect(code).toContain('loadAcWords(editorCreds)');
  });
  it('uses the Icon component, never the legacy webfont <i>', () => {
    expect(code).toContain('import Icon from "../common/Icon.jsx"');
    expect(code).not.toMatch(/<i\s+className="ti/);
  });
  it('Estimate shows a single-side cost panel; Execute shows a capped result table', () => {
    expect(code).toContain('import CostEstimatePanel');
    expect(code).toContain('<CostEstimatePanel estimate={estimate.raw}');
    expect(code).toContain('maxRows={RESULT_MAX_ROWS}');
    expect(code).toContain('maxHeight={RESULT_MAX_HEIGHT}');
    expect(code).not.toContain('variant="fixed"');
  });
  it('Estimate and Execute are mutually exclusive per side', () => {
    expect(code).toContain('setLeftExec(null)');   // estimate clears exec
    expect(code).toContain('setLeftEstimate(null)'); // execute clears estimate
  });
  it('Compare estimates both queries together for a consistent comparison', () => {
    expect(code).toContain('const runCompare');
    expect(code).toContain('Promise.all');
    expect(code).toContain('setCompareData({ left: l, right: r })');
    expect(code).toContain('mode="estimate"');
  });
  it('supports a fullscreen mode toggled and exited with Escape', () => {
    expect(code).toContain('setFullscreen');
    expect(code).toContain('cmp-fullscreen');
    expect(code).toContain('"Escape"');
  });
  it('panes and result areas are memoized for smooth typing', () => {
    expect(code).toContain('const ComparePane = memo(');
    expect(code).toContain('const PaneResults = memo(');
  });
  it('gates run buttons on being connected', () => {
    expect(code).toContain('!editorConnected');
    expect(code).toContain('connected');
  });
});

describe('ComparisonMetrics: memoized', () => {
  const code = read('src/frontend/components/editor/ComparisonMetrics.jsx');
  it('is wrapped in memo', () => {
    expect(code).toContain('export default memo(ComparisonMetrics)');
  });
});

describe('SqlEditorPage: mode switch', () => {
  const code = read('src/frontend/components/editor/SqlEditorPage.jsx');
  it('defaults to Regular and passes mode + onModeChange to both children', () => {
    expect(code).toContain('useState("regular")');
    // Both panes stay mounted so neither loses its editor state on a switch,
    // which means each also has to be told whether it is the visible one -
    // otherwise the hidden pane answers keyboard shortcuts too. Asserted on
    // the props rather than an exact JSX string, which pinned the markup as it
    // stood before `active` was added.
    for (const frag of ['<QueryEditor', 'mode={mode}', 'onModeChange={setMode}', 'active={regular}']) {
      expect(code).toContain(frag);
    }
    expect(code).toContain('<ComparisonView mode={mode} onModeChange={setMode} active={!regular} />');
  });
});

describe('ModeSelect: Regular / Comparison dropdown', () => {
  const code = read('src/frontend/components/editor/ModeSelect.jsx');
  it('is a select with Regular and Comparison options (no "Mode" wording)', () => {
    expect(code).toContain('<Select');
    expect(code).toContain('value="regular"');
    expect(code).toContain('value="comparison"');
    expect(code).toContain('>Regular<');
    expect(code).toContain('>Comparison<');
    expect(code).not.toContain('Regular Mode');
    expect(code).not.toContain('Comparison Mode');
  });
  it('is placed next to the connect control in both toolbars', () => {
    const qe = read('src/frontend/components/editor/QueryEditor.jsx');
    const cv = read('src/frontend/components/editor/ComparisonView.jsx');
    expect(qe).toContain('import ModeSelect from "./ModeSelect.jsx"');
    expect(qe).toContain('<ModeSelect mode={mode} onChange={onModeChange} />');
    expect(cv).toContain('import ModeSelect from "./ModeSelect.jsx"');
    expect(cv).toContain('<ModeSelect mode={mode} onChange={onModeChange} />');
  });
  it('both connect buttons read "Go", not "Connect"', () => {
    const qe = read('src/frontend/components/editor/QueryEditor.jsx');
    const cv = read('src/frontend/components/editor/ComparisonView.jsx');
    expect(qe).toMatch(/Go\s*<\/button>/);
    expect(cv).toMatch(/Go\s*<\/button>/);
  });
});

describe('Highlighter extraction', () => {
  // utils/sqlHighlight.js is gone. Highlighting is no longer a string-to-HTML
  // helper over a textarea: CodeMirror does it from a dialect built out of the
  // connected server's own keyword and function lists. buildDialect is the
  // replacement, and sqlHighlight.test.js exercises it against a real parse
  // tree. What this block still guards is that ONE module owns highlighting
  // and QueryEditor is not doing it inline again.
  it('sqlEditorSetup.js owns the dialect and the highlight style', () => {
    const code = read('src/frontend/components/editor/sqlEditorSetup.js');
    expect(code).toContain('export function buildDialect');
    expect(code).toContain('HighlightStyle');
  });
  it('QueryEditor does not define highlighting inline', () => {
    const code = read('src/frontend/components/editor/QueryEditor.jsx');
    expect(code).not.toContain('function highlightSQL(');
    expect(code).not.toContain('const SQL_KW = new Set');
    // It feeds the shared surface instead.
    expect(code).toContain('dialectData');
  });
});

describe('Routing: editor/query renders SqlEditorPage', () => {
  const code = read('src/frontend/components/layout/MainLayout.jsx');
  it('lazy-imports and routes SqlEditorPage', () => {
    expect(code).toContain('import("../editor/SqlEditorPage.jsx")');
    expect(code).toContain('["editor/query", SqlEditorPage]');
  });
});
