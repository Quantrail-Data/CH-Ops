/** @vitest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/frontend/components/editor/SqlEditor.jsx', () => ({
    default: ({ value, variant }) => (
        <pre data-testid="sql-editor" data-variant={variant}>{value}</pre>
    ),
}));

import QueryPreviewPanel from '../../src/frontend/components/editor/QueryPreviewPanel.jsx';

describe('QueryPreviewPanel', () => {
    it('materializes parameterized SQL and shows the values sent to ClickHouse', () => {
        render(
            <QueryPreviewPanel
                sql="SELECT * FROM logs WHERE region = {region:String} AND user_id = {user_id:UInt64} /*[{tenant:String}]*/"
                values={{ region: 'us-east', user_id: 42, tenant: 'ops' }}
            />,
        );

        expect(screen.getByText(/this is what will be sent to clickhouse/i)).toBeInTheDocument();
        expect(screen.getByTestId('sql-editor')).toHaveTextContent('region:String');
        expect(screen.getByText(/parameters sent \(3\)/i)).toBeInTheDocument();
        expect(screen.getByText(/param_region = us-east/i)).toBeInTheDocument();
        expect(screen.getByText(/param_user_id = 42/i)).toBeInTheDocument();
        expect(screen.getByText(/param_tenant = ops/i)).toBeInTheDocument();
    });

    it('shows a validation error when the SQL cannot materialize', () => {
        render(
            <QueryPreviewPanel
                sql="SELECT * FROM logs WHERE user_id = {user_id:UInt64}"
                values={{ user_id: undefined }}
            />,
        );

        expect(screen.getByText(/none\. any optional filters left blank have been removed from the query above\./i)).toBeInTheDocument();
    });
});
