import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/frontend/App.jsx', () => ({
  useAuth: () => ({ auth: { username: 'tester' } }),
  useConnection: () => ({ selectedClusterId: 'cluster-1', selectedNode: 'node-1', port: 8123, user: 'default' }),
  useTheme: () => ({ theme: 'light' }),
}));
vi.mock('../../src/frontend/components/rbac/OnClusterBanner.jsx', () => ({
  useRbacContext: () => null,
  SessionAffinityWarning: () => <div />,
}));
vi.mock('../../src/frontend/components/editor/useQueryTabs.js', () => ({
  nextTabName: () => 'Query 2',
  useQueryTabs: () => ({
    tabs: [{ id: 'tab-1', name: 'Query 1', sql: '', params: {}, explainTicked: [], explainType: 'EXPLAIN' }],
    activeId: 'tab-1',
    activeTab: { id: 'tab-1', name: 'Query 1', sql: '', params: {}, explainTicked: [], explainType: 'EXPLAIN' },
    runtime: {}, activeRuntime: { result: [], resultCols: [], totalRows: 0, truncated: false, error: '', successMsg: '', queryStats: null, memoryUsage: null, lastQueryId: null, featureQueryId: null, estimateResult: null, estimating: false, graphData: null, graphTitle: '', running: false },
    canAddTab: true, updateTab: vi.fn(), setRuntime: vi.fn(), setParam: vi.fn(), addTab: vi.fn(),
  }),
}));
vi.mock('../../src/frontend/utils/api.js', () => ({
  runEditorQuery: vi.fn(), apiFetch: vi.fn(), editorConnect: vi.fn(),
  editorConnectionStatus: vi.fn().mockResolvedValue({ connected: false }), editorDisconnect: vi.fn(),
}));
vi.mock('../../src/frontend/components/editor/SqlEditor.jsx', () => ({ default: () => <textarea aria-label="SQL editor" /> }));
vi.mock('../../src/frontend/components/editor/QueryTabs.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/CostEstimatePanel.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/QueryPreviewPanel.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ModeSelect.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ExportWizard.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ShareDialog.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/BookmarkExport.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ConfirmDialog.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ParamStrip.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/editor/ExplainOptions.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/common/AIDDLButton.jsx', () => ({ default: () => <div /> }));
vi.mock('../../src/frontend/components/common/AIDDLModelComponent.jsx', () => ({ default: () => <div /> }));

import QueryEditor from '../../src/frontend/components/editor/QueryEditor.jsx';

describe('QueryEditor', () => {
  it('renders the credential form before an editor connection is established', async () => {
    render(<MemoryRouter><QueryEditor active mode="editor" onModeChange={vi.fn()} /></MemoryRouter>);

    expect(await screen.findByLabelText('ClickHouse username')).toBeInTheDocument();
    expect(screen.getByLabelText('ClickHouse password')).toBeInTheDocument();
  });
});
