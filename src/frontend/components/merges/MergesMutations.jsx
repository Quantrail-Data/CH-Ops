// MergesMutations - Monitor merges, mutations, and replication queue
//
// Displays real-time status of ClickHouse® background operations.
// Shows three sections: active merges (with progress percentage),
// active mutations (pending operations), and replication queue
// (replica sync status).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect, useCallback } from 'react';
import Icon from "../common/Icon.jsx";
import { useQuery } from '../../hooks/useQuery.js';
import { StatCard } from '../layout/SharedComponents.jsx';
import DataTable from '../layout/DataTable.jsx';

export default function MergesMutations() {
  const mq = useQuery(), muq = useQuery(), rq = useQuery();
  const load = useCallback(() => {
    mq.execute("SELECT database, table, round(elapsed,1) AS elapsed, round(progress*100,1) AS progress_pct, rows_read, rows_written, formatReadableSize(memory_usage) AS memory FROM system.merges");
    muq.execute("SELECT database, table, mutation_id, command, parts_to_do, latest_fail_reason FROM system.mutations WHERE is_done=0 AND is_killed=0");
    rq.execute("SELECT database, table, replica_name, node_name, type, toString(create_time) AS create_time FROM system.replication_queue LIMIT 100");
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);


  if (mq.loading && !mq.data) return <div className="page-content"><div className="empty-state" style={{ padding: 40 }}><div className="loading-spinner"></div> Loading...</div></div>;

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-refresh"></Icon> Merges, Mutations & Replication</h2></div>
      <div className="stat-grid">
        <StatCard icon="ti-arrows-join" label="Active Merges" value={mq.data?.length ?? 0} />
        <StatCard icon="ti-edit" label="Active Mutations" value={muq.data?.length ?? 0} />
        <StatCard icon="ti-copy" label="Replication Queue" value={rq.data?.length ?? 0} />
      </div>
      <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}>Merges</h3>
      <DataTable rows={mq.data||[]} columns={['database','table','elapsed','progress_pct','rows_read','rows_written','memory']} emptyMessage="No active merges. Your data is well-organized." variant="fixed" />
      <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}>Mutations</h3>
      <DataTable rows={muq.data||[]} columns={['database','table','mutation_id','command','parts_to_do','latest_fail_reason']} emptyMessage="No active mutations. Smooth sailing." variant="fixed" />
      <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}>Replication Queue</h3>
      <DataTable rows={rq.data||[]} columns={['database','table','replica_name','type','create_time']} emptyMessage="All replicas are in sync." variant="fixed" />
    </div>
  );
}
