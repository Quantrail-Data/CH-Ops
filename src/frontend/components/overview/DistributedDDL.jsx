// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Tracks, coordinates, and executes distributed DDL queries across multiple cluster nodes simultaneously.

import React, { useEffect, useRef, useCallback } from 'react';
import Icon from "../common/Icon.jsx";
import { useQuery } from '../../hooks/useQuery.js';
import { StatCard } from '../layout/SharedComponents.jsx';
import DataTable from '../layout/DataTable.jsx';

export default function DistributedDDL() {
  // DDL cards
  const ddlLenQ = useQuery(), ddlMedianQ = useQuery(), ddlFailedQ = useQuery();
  // DDL slow table
  const ddlSlowQ = useQuery();
  // Readonly tables
  const readonlyQ = useQuery();

  // Auto-refresh tracking
  const ddlRefreshing = useRef(false);
  const roRefreshing = useRef(false);

  const loadDDL = useCallback(() => {
    if (ddlRefreshing.current) return;
    ddlRefreshing.current = true;
    Promise.allSettled([
      ddlLenQ.execute("SELECT count() AS cnt FROM system.distributed_ddl_queue WHERE status='Inactive'"),
      ddlMedianQ.execute("SELECT median(query_duration_ms) AS val FROM system.distributed_ddl_queue WHERE status='Finished'"),
      ddlFailedQ.execute("SELECT count() AS cnt FROM system.distributed_ddl_queue WHERE exception_text!=''"),
      ddlSlowQ.execute("SELECT cluster, query, query_create_time, query_duration_ms/1000 AS query_duration_seconds, status FROM system.distributed_ddl_queue WHERE status!='Finished' ORDER BY status"),
    ]).finally(() => { ddlRefreshing.current = false; });
  }, []);

  const loadReadonly = useCallback(() => {
    if (roRefreshing.current) return;
    roRefreshing.current = true;
    readonlyQ.execute("SELECT database, table, is_readonly, absolute_delay, zookeeper_exception FROM system.replicas WHERE is_readonly=1")
      .catch(() => {})
      .finally(() => { roRefreshing.current = false; });
  }, []);

  useEffect(() => {
    loadDDL();
    loadReadonly();
    const ddlInterval = setInterval(loadDDL, 10000);
    const roInterval = setInterval(loadReadonly, 30000);
    return () => { clearInterval(ddlInterval); clearInterval(roInterval); };
  }, []);

  const medianVal = ddlMedianQ.data?.[0]?.val;
  const medianDisplay = medianVal != null ? `${Math.round(medianVal)} ms` : '0 ms';
  const ddlError = ddlLenQ.error || ddlMedianQ.error || ddlFailedQ.error;

  if (ddlLenQ.loading && !ddlLenQ.data) return <div className="page-content"><div className="empty-state" style={{ padding: 40 }}><div className="loading-spinner"></div> Loading...</div></div>;

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-database-cog"></Icon> Distributed DDL & Readonly Tables</h2></div>

      {ddlError && <div className="alert-banner info" style={{ marginBottom: 14 }}><Icon className="ti ti-info-circle"></Icon> DDL queue not available. This is normal for single-node setups without distributed_ddl_queue.</div>}

      <h3 style={{ fontSize: '15px', margin: '0 0 12px' }}><Icon className="ti ti-list-details" style={{ marginRight: 6 }}></Icon>Distributed DDL Queue <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(auto-refresh 10s)</span></h3>
      <div className="stat-grid">
        <StatCard icon="ti-clock" label="DDL Queue Length" value={ddlLenQ.data?.[0]?.cnt ?? '0'} color="var(--color-warning)" />
        <StatCard icon="ti-chart-line" label="Median Processing Time" value={medianDisplay} />
        <StatCard icon="ti-alert-triangle" label="Failed DDLs" value={ddlFailedQ.data?.[0]?.cnt ?? '0'} color={(parseInt(ddlFailedQ.data?.[0]?.cnt) || 0) > 0 ? 'var(--color-danger)' : undefined} />
      </div>

      <h4 style={{ fontSize: '14px', margin: '16px 0 8px' }}>Slow / Pending DDLs</h4>
      <DataTable rows={ddlSlowQ.data || []} columns={['cluster', 'query', 'query_create_time', 'query_duration_seconds', 'status']} emptyMessage="No slow or pending DDLs. All clear." variant="fixed" />

      <div className="divider"></div>

      <h3 style={{ fontSize: '15px', margin: '0 0 12px' }}><Icon className="ti ti-lock" style={{ marginRight: 6 }}></Icon>Read-Only Tables <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(auto-refresh 30s)</span></h3>
      <DataTable rows={readonlyQ.data || []} columns={['database', 'table', 'is_readonly', 'absolute_delay', 'zookeeper_exception']} emptyMessage="No read-only tables. All replicas healthy." variant="fixed" />
    </div>
  );
}
