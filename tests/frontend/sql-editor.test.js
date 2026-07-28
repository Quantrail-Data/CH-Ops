// Copyright (C) 2026 Quantrail™ Data Private Limited
// sql-editor.test.js - the SQL Editor: EXPLAIN tree, history, bookmarks, autocomplete and shortcuts
// Contributors - Kathir Moorthy, Kathirdhasan

import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

describe('SQL Editor: EXPLAIN Tree - layout', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('type tree, orient TB, edgeShape polyline', () => { expect(code).toContain("type: \"tree\""); expect(code).toContain("orient: \"TB\""); expect(code).toContain("edgeShape: \"polyline\""); });
  it('imports shared tree utility for symbolSize and sizing', () => { expect(code).toContain("treeChart.js"); });
  it('8 categories with golden-angle spacing', () => { expect(code).toContain('CAT_MATCHERS'); expect(code).toContain('137.508'); ['ReadFrom', 'Filter', 'Sort/Limit', 'Aggregate', 'Join', 'Transform', 'Output'].forEach(c => expect(code).toContain(c)); });
});

describe('SQL Editor: EXPLAIN Tree - DAG→tree algorithm', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('builds adjacency list from links', () => { expect(code).toContain('childrenMap'); expect(code).toContain('l.source'); expect(code).toContain('l.target'); });
  it('finds roots via hasParent set', () => { expect(code).toContain('hasParent'); expect(code).toContain('!hasParent.has(n.id)'); });
  it('falls back to first node if no root', () => { expect(code).toContain('!roots.length && graphData.nodes.length'); });
  it('DFS uses visited set for cycle safety', () => { expect(code).toContain('visited.has(id)'); expect(code).toContain('visited.add(id)'); });
  it('single root direct, multiple under synthetic Root', () => { expect(code).toContain('roots.length === 1'); expect(code).toContain("name: \"Root\""); });
  it('category matching uses ordered first-match', () => { expect(code).toContain('CAT_MATCHERS.find((c) => c.match(name))'); });
});

describe('SQL Editor: EXPLAIN Tree - labels and edges', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('labels use the monospace code font, wraps long names', () => { expect(code).toMatch(/red hat mono/i); expect(code).toContain('wrapLabel'); });
  it('chart auto-sized inside scroll container, no roam', () => { expect(code).toContain('treeSizeTB'); expect(code).not.toContain('roam'); });
  it('has HTML toolbar with download, zoom, fullscreen buttons', () => { expect(code).toContain('graphDownload'); expect(code).toContain('graphZoom'); expect(code).toContain('graphFullscreen'); expect(code).toContain('ti-download'); expect(code).toContain('ti-zoom-in'); expect(code).toContain('ti-zoom-out'); expect(code).toContain('ti-arrows-maximize'); });
});

describe('SQL Editor: Query Stats', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('displays read_rows, written_rows, elapsed', () => { expect(code).toContain('queryStats'); expect(code).toContain('read_rows'); expect(code).toContain('written_rows'); expect(code).toContain('elapsed_ns'); });
});

describe('SQL Editor: Explorer', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('resizable width via drag (160-500px)', () => { expect(code).toContain('explorerWidth'); expect(code).toContain('col-resize'); });
  it('collapsible SQL input + fullscreen', () => { expect(code).toContain('sqlCollapsed'); expect(code).toContain('fullscreen'); });
});

describe('SQL Editor: ClickHouse® Service', () => {
  const code = read('src/backend/services/clickhouse.js');
  it('sends X-ClickHouse-Summary header for stats', () => { expect(code).toContain('X-ClickHouse-Summary'); });
  it('injects FORMAT for data queries', () => { expect(code).toContain('FORMAT'); });
  // it('treats the exception-code header as a failure, not just the HTTP status', () => { expect(code).toContain('X-ClickHouse-Exception-Code'); });
});

describe('SQL Editor: Query History', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('stores history in localStorage with max cap', () => { expect(code).toContain('HISTORY_KEY'); expect(code).toContain('HISTORY_MAX'); expect(code).toContain('localStorage'); });
  it('records sql, timestamp, rows, status, elapsed per entry', () => {
    // History is written in doRun from the finished tab's runtime, so the
    // status is read off that rather than a bare `error` variable.
    expect(code).toContain('sql: lastSqlRef.current');
    expect(code).toContain('timestamp:');
    expect(code).toContain('status: finished.error ? "error" : "ok"');
    expect(code).toContain('elapsed:');
  });
  it('history panel lists entries with click-to-load', () => {
    // Loading opens a NEW tab rather than overwriting whatever is being
    // written, so this is openInNewTab, not setSql.
    expect(code).toContain('panel === "history"');
    expect(code).toContain('openInNewTab("History", h.sql)');
  });
  it('has clear history button', () => { expect(code).toContain('clearHistory'); });
  it('capped at 100 entries', () => { expect(code).toContain('HISTORY_MAX = 100'); });
});

describe('SQL Editor: Query Bookmarks', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('stores bookmarks in backend via settings API', () => { expect(code).toContain('query_bookmarks'); expect(code).toContain("category: \"editor\""); expect(code).toContain("apiFetch(\"/api/settings/query_bookmarks\""); });
  it('save bookmark with name and sql', () => { expect(code).toContain('saveBookmark'); expect(code).toContain('bookmarkName'); });
  it('delete bookmark by index', () => { expect(code).toContain('deleteBookmark'); });
  it('bookmarks panel shows name and sql, click to load', () => {
    expect(code).toContain('panel === "bookmarks"');
    expect(code).toContain('openInNewTab(b.name, b.sql, b)');
  });
  it('loads bookmarks on mount', () => { expect(code).toContain('loadBookmarks'); });
});


describe('SQL Editor: Export button opens the wizard', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('imports the wizard', () => { expect(code).toContain('ExportWizard'); });
  it('has open/closed state for the wizard', () => { expect(code).toContain('exportOpen'); expect(code).toContain('setExportOpen'); });
  it('renders the wizard when open and passes the editor SQL', () => { expect(code).toContain('{exportOpen && ('); expect(code).toContain('sql={sql}'); });
  it('the button is enabled by SQL, not by results being on screen', () => { expect(code).toContain('disabled={!sql?.trim()}'); });
});

describe('SQL Editor: old in-browser export is gone', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  it('no client-side format writers', () => { expect(code).not.toContain('exportCSV'); expect(code).not.toContain('exportTSV'); expect(code).not.toContain('exportJSON'); });
  it('no fixed query-results filenames', () => { expect(code).not.toContain('query-results.csv'); expect(code).not.toContain('query-results.tsv'); expect(code).not.toContain('query-results.json'); });
  it('no Chromium-only save picker', () => { expect(code).not.toContain('showSaveFilePicker'); });
  it('export is no longer gated on rows being on screen', () => { expect(code).not.toContain("result?.length > 0 && !error"); });
});

describe('SQL Editor: Export wizard and its API', () => {
  const wizard = read('src/frontend/components/editor/ExportWizard.jsx');
  const api = read('src/frontend/utils/exportApi.js');
  const route = read('src/backend/routes/export.js');
  const server = read('src/backend/server.js');

  it('wizard has three steps', () => { expect(wizard).toContain('1. Query'); expect(wizard).toContain('2. Format'); expect(wizard).toContain('3. Download'); });
  it('Next is blocked until an estimate has been attempted', () => {
    // Also blocked when the SQL declares a required parameter: export does not
    // carry parameter values, so the placeholder would reach ClickHouse unset.
    expect(wizard).toContain('disabled={!tried || blockedByParams}');
  });
  it('warns when the statement is not SELECT-like, without blocking', () => { expect(wizard).toContain('isSelectLike'); expect(wizard).toContain('{!selectLike && ('); });
  it('warns when more than one statement is present', () => { expect(wizard).toContain('hasMultipleStatements'); });
  it('offers background running and cancel', () => { expect(wizard).toContain('Run in background'); expect(wizard).toContain('Cancel export'); });
  it('suspends the idle logout while a job runs', () => { expect(wizard).toContain('beginBusy'); expect(wizard).toContain('endBusy'); });

  it('client calls the export endpoints', () => { expect(api).toContain('/api/export/estimate'); expect(api).toContain('/api/export/jobs'); });
  it('download uses a one-time ticket, since a browser download cannot send the auth header', () => { expect(api).toContain('/ticket'); expect(api).toContain('/api/export/download/'); });

  it('route exposes estimate, jobs, progress, ticket and cancel', () => { expect(route).toContain('"/estimate"'); expect(route).toContain('"/jobs"'); expect(route).toContain('"/jobs/:id"'); expect(route).toContain('"/jobs/:id/ticket"'); });
  it('every job read checks the owner', () => { expect(route).toContain('req.user?.username'); });
  it('only settings from the shared catalogue are forwarded', () => { expect(route).toContain('ALLOWED_SETTINGS'); });
  it('download route is mounted before the authenticated routes', () => {
    // Compare against the ROUTER mount. A body-size cap is also mounted on
    // '/api/export', earlier in the file, and it calls next() rather than
    // handling the request - so a plain indexOf finds the wrong line.
    const downloadAt = server.indexOf("'/api/export/download'");
    const routerAt = server.indexOf("app.use('/api/export', rateLimiter");
    expect(downloadAt).toBeGreaterThan(-1);
    expect(routerAt).toBeGreaterThan(-1);
    expect(downloadAt).toBeLessThan(routerAt);
  });
  it('old table download route is gone', () => { expect(server).not.toContain('/api/table/download'); });
});

describe('SQL Editor: Autocomplete', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  // Completion sources and the keymap live here since the editor became
  // CodeMirror.
  const setup = read('src/frontend/components/editor/sqlEditorSetup.js');
  it('loads keywords from system.keywords', () => { expect(code).toContain("SELECT keyword FROM system.keywords"); });
  it('loads functions from system.functions', () => {
    // The completion sources moved into sqlEditorSetup.js when the editor
    // became CodeMirror; QueryEditor now just calls loadFunctionRows.
    expect(setup).toContain('SELECT name FROM system.functions');
    expect(code).toContain('loadFunctionRows');
  });
  it('loads database.table names from system.tables', () => { expect(code).toContain("SELECT database, name FROM system.tables"); });
  it('excludes system databases from autocomplete', () => { expect(code).toContain("NOT IN ('system'"); });
  it('supports dot in word matching for db.table', () => {
    expect(setup).toContain('matchBefore(/[\\w.]+/)');
  });
  it('reloads on connection change', () => { expect(code).toContain("loadAutocomplete"); });
});

describe('SQL Editor: Keyboard Shortcuts', () => {
  const code = read('src/frontend/components/editor/QueryEditor.jsx');
  const setup = read('src/frontend/components/editor/sqlEditorSetup.js');
  // The shortcut hint moved onto the tab strip.
  const tabsCode = read('src/frontend/components/editor/QueryTabs.jsx');
  it('Ctrl+Enter runs query', () => {
    // A CodeMirror keymap now, not a keydown handler on a textarea.
    expect(setup).toContain('key: "Mod-Enter"');
    expect(code).toContain('onRun={runActiveTab}');
  });
  it('Ctrl+B toggles bookmarks', () => {
    expect(setup).toContain('key: "Mod-b"');
    expect(code).toContain('onBookmarks');
  });
  it('displays keyboard hints', () => {
    // The hint moved onto the tab strip when tabs took that row.
    expect(tabsCode).toContain('Ctrl+Enter');
    expect(tabsCode).toContain('Ctrl+B');
  });
});
