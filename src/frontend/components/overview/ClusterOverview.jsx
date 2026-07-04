// Copyright (C) 2026 Quantrail™ Data Private Limited
// @Kathir -> Kathir Moorthy
// High-level monitoring dashboard displaying the real-time status, health, and utilization of all cluster nodes.
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useQuery } from '../../hooks/useQuery.js';
import DataTable from '../layout/DataTable.jsx';
import { initChart, disposeChart } from '../../utils/echarts.js';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';


function isDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}


function StatCard({ icon, label, value, iconColor }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon">
        <Icon className={`ti ${icon}`} style={{ color: iconColor }} />
      </div>
      <div className="stat-card-content">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{value ?? '-'}</div>
      </div>
    </div>
  );
}


/*  Format raw bytes.                                                 */
function fmtBytes(n) {
  if (!n || !isFinite(n)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + ' ' + units[u];
}


/*  Format uptime seconds → "X Days, Y Hrs and Z Mins"               */

function fmtUptime(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '-';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} Days, ${h} Hrs and ${m} Mins`;
  if (h > 0) return `${h} Hrs and ${m} Mins`;
  return `${m} Mins`;
}


/*  Format ZK session uptime compactly.                               */

function fmtZkUptime(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '-';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}


/*  Render a donut pie chart.                                         */

function renderPie(instRef, elRef, title, segments) {
  if (!elRef.current) return;
  if (!instRef.current) instRef.current = initChart(elRef.current);

  const dark = isDark();
  const textColor = dark ? '#e2e8f0' : '#1a1a2e';

  instRef.current.setOption({
    tooltip: {
      trigger: 'item',
      formatter: ({ name, value, percent }) =>
        `${name}: ${fmtBytes(value)} (${percent}%)`,
    },
    title: {
      text: title,
      left: 'center',
      top: 4,
      textStyle: { fontSize: 13, fontWeight: 600, color: textColor },
    },
    series: [{
      type: 'pie',
      radius: ['42%', '72%'],
      center: ['50%', '55%'],
      label: { color: textColor, fontSize: 11, formatter: '{b}\n{d}%' },
      emphasis: { label: { fontSize: 13, fontWeight: 600 } },
      data: segments,
    }],
  }, true);

  instRef.current.resize();
}


/*  ClusterOverview                                                   */

export default function ClusterOverview() {

  /* Queries */
  const version          = useQuery();
  const uptime           = useQuery();
  const dbCount          = useQuery();
  const tableCount       = useQuery();
  const queryCount       = useQuery();
  const mergeCount       = useQuery();
  const mutationCount    = useQuery();
  const readonlyCount    = useQuery();
  const clusters         = useQuery();
  const readonlyReplicas = useQuery();
  const disks            = useQuery();
  const memory           = useQuery();
  const zookeeper        = useQuery();
  const connections      = useQuery();

  /* Chart refs */
  const osRamEl   = useRef(null);
  const chRamEl   = useRef(null);
  const diskEl    = useRef(null);
  const osRamInst = useRef(null);
  const chRamInst = useRef(null);
  const diskInst  = useRef(null);

  // Chart toolbars (HTML): save + full screen, no zoom (pies)
  const osRamTools = useChartTools(() => osRamInst.current, { filename: 'OS Memory' });
  const chRamTools = useChartTools(() => chRamInst.current, { filename: 'ClickHouse vs Other Processes' });
  const diskTools  = useChartTools(() => diskInst.current, { filename: 'Disk' });
  useEffect(() => { const t = setTimeout(() => osRamInst.current?.resize(), 150); return () => clearTimeout(t); }, [osRamTools.fullscreen]);
  useEffect(() => { const t = setTimeout(() => chRamInst.current?.resize(), 150); return () => clearTimeout(t); }, [chRamTools.fullscreen]);
  useEffect(() => { const t = setTimeout(() => diskInst.current?.resize(), 150); return () => clearTimeout(t); }, [diskTools.fullscreen]);

  /* Theme key */
  const [themeKey, setThemeKey] = useState(0);

    /* selected Disk for Pie chart */
  const [selectedDiskPieIndex, setSelectedDiskPieIndex] = useState(0);


  /* Fetch all data */
  const load = useCallback(() => {
    version.execute('SELECT version() AS version');
    uptime.execute('SELECT uptime() AS seconds');
    dbCount.execute('SELECT count() AS cnt FROM system.databases');
    tableCount.execute('SELECT count() AS cnt FROM system.tables');
    queryCount.execute('SELECT count() AS cnt FROM system.processes');
    mergeCount.execute('SELECT count() AS cnt FROM system.merges');
    mutationCount.execute(
      "SELECT count() AS cnt FROM system.mutations WHERE is_done = 0 AND is_killed = 0"
    );
    readonlyCount.execute(
      "SELECT count() AS cnt FROM system.replicas WHERE is_readonly = 1"
    );
    clusters.execute(`
      SELECT cluster, host_name, host_address AS ip,
             shard_num AS shard, replica_num AS replica,
             errors_count, slowdowns_count
      FROM system.clusters
    `);
    readonlyReplicas.execute(
      "SELECT database, table, readonly_start_time FROM system.replicas WHERE is_readonly = 1"
    );
    disks.execute(`
      SELECT name, total_space, free_space,
             formatReadableSize(total_space) AS total_fmt,
             formatReadableSize(free_space) AS free_fmt,
             round((1 - free_space / total_space) * 100, 1) AS used_pct
      FROM system.disks
    `);
    memory.execute(`
      SELECT metric, value
      FROM system.asynchronous_metrics
      WHERE metric IN ('OSMemoryTotal', 'OSMemoryAvailable', 'MemoryResident')
    `);
    zookeeper.execute('SELECT * FROM system.zookeeper_connection');
    connections.execute(
      "SELECT metric, value FROM system.metrics WHERE metric LIKE '%Connection' ORDER BY value DESC"
    );
  }, []);

  /* Auto-refresh */
  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  /* Theme observer */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      [osRamEl, chRamEl, diskEl].forEach(ref => {
        if (ref.current) disposeChart(ref.current);
      });
      osRamInst.current = null;
      chRamInst.current = null;
      diskInst.current = null;
      setThemeKey(k => k + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  /* Parse memory metrics */
  const mem = useMemo(() => {
    if (!memory.data?.length) return null;
    const map = {};
    for (const row of memory.data) map[row.metric] = Number(row.value) || 0;
    const osTotal = map.OSMemoryTotal || 0;
    const osFree  = map.OSMemoryAvailable || 0;
    const osUsed  = osTotal - osFree;
    const chUsed  = map.MemoryResident || 0;
    return { osTotal, osFree, osUsed, chUsed };
  }, [memory.data]);

  /* OS RAM pie */
  useEffect(() => {
    if (!mem) return;
    renderPie(osRamInst, osRamEl, 'OS Memory', [
      { value: mem.osUsed, name: 'Used', itemStyle: { color: '#3b82f6' } },
      { value: mem.osFree, name: 'Free', itemStyle: { color: '#22d3ee' } },
    ]);
  }, [mem, themeKey]);

  /* ClickHouse RAM pie */
  useEffect(() => {
    if (!mem) return;
    const otherUsed = Math.max(0, mem.osUsed - mem.chUsed);
    renderPie(chRamInst, chRamEl, 'ClickHouse vs Other Processes', [
      { value: mem.chUsed,  name: 'ClickHouse', itemStyle: { color: '#8b5cf6' } },
      { value: otherUsed,   name: 'Others',     itemStyle: { color: '#fb923c' } },
    ]);
  }, [mem, themeKey]);

  /* Disk pie */
  useEffect(() => {
    if (!disks.data?.length) return;
    const d = disks?.data[selectedDiskPieIndex || 0];
    setSelectedDiskPieIndex(disks?.data &&  0)
    renderPie(diskInst, diskEl, `Disk: ${d?.name}`, [
      { value: d.total_space - d.free_space, name: 'Used', itemStyle: { color: '#f59e0b' } },
      { value: d.free_space,                 name: 'Free', itemStyle: { color: '#34d399' } },
    ]);
  }, [disks.data, themeKey]);

  /* Resize */
  useEffect(() => {
    const onResize = () => {
      [osRamInst, chRamInst, diskInst].forEach(ref => ref.current?.resize());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Cleanup */
  useEffect(() => () => {
    [osRamEl, chRamEl, diskEl].forEach(ref => {
      if (ref.current) disposeChart(ref.current);
    });
  }, []);

  /* Derived */
  const zk = zookeeper.data?.[0];
  const conns = connections.data || [];
  const totalConns = conns.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  const readonlyVal = readonlyCount.data?.[0]?.cnt;
  const hasReadonly = Number(readonlyVal) > 0;

  /* Loading */
  if (version.loading && !version.data) {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner" /> Loading...
        </div>
      </div>
    );
  }

    const handleDiskPie = (index) =>{
    setSelectedDiskPieIndex(index)
    
    if (!disks.data?.length) return;
    const d = disks?.data[index];
    renderPie(diskInst, diskEl, `Disk: ${d.name}`, [
      { value: d?.total_space - d?.free_space, name: 'Used', itemStyle: { color: '#f59e0b' } },
      { value: d?.free_space,                 name: 'Free', itemStyle: { color: '#34d399' } },
    ]);
  }
    const chartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };


  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-topology-star" /> Node Overview
        </h2>
      </div>

      {/* Stat cards: 4 × 2 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12, marginBottom: 20,
      }}>
        <StatCard icon="ti-server-cog"  label="Version"         value={version.data?.[0]?.version} iconColor="#3b82f6" />
        <StatCard icon="ti-clock"       label="Uptime"          value={uptime.data?.[0]?.seconds ? fmtUptime(uptime.data[0].seconds) : '-'} iconColor="#22c55e" />
        <StatCard icon="ti-database"    label="Databases"       value={dbCount.data?.[0]?.cnt} iconColor="#8b5cf6" />
        <StatCard icon="ti-table"       label="Tables"          value={tableCount.data?.[0]?.cnt} iconColor="#06b6d4" />
        <StatCard icon="ti-terminal-2"  label="Active Queries"  value={queryCount.data?.[0]?.cnt} iconColor="#f59e0b" />
        <StatCard icon="ti-arrows-join" label="Merges"          value={mergeCount.data?.[0]?.cnt} iconColor="#ec4899" />
        <StatCard icon="ti-edit"        label="Mutations"       value={mutationCount.data?.[0]?.cnt} iconColor="#f97316" />
        <StatCard icon="ti-lock"        label="Readonly Tables" value={readonlyVal ?? '-'} iconColor={hasReadonly ? '#ef4444' : '#94a3b8'} />
      </div>

      {/* Readonly alert */}
      {hasReadonly && (
        <div className="alert-banner danger" style={{ marginBottom: 16 }}>
          <Icon className="ti ti-alert-circle" />{' '}
          {readonlyVal} readonly replica(s) detected. Check replication status.
        </div>
      )}

      {/* Memory pie charts: 2 per row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={osRamTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' } : { padding: 16 }}>
          <ChartToolbar fullscreen={osRamTools.fullscreen} onSave={osRamTools.save} onToggleFullscreen={osRamTools.toggleFullscreen} isWantFeature={chartControlsFlags}/>
          <div ref={osRamEl} style={{ height: osRamTools.fullscreen ? 'calc(100vh - 96px)' : 360, width: '100%', flex: osRamTools.fullscreen ? 1 : undefined }} />
        </div>
        <div className="card" style={chRamTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' } : { padding: 16 }}>
          <ChartToolbar fullscreen={chRamTools.fullscreen} onSave={chRamTools.save} onToggleFullscreen={chRamTools.toggleFullscreen} isWantFeature={chartControlsFlags} />
          <div ref={chRamEl} style={{ height: chRamTools.fullscreen ? 'calc(100vh - 96px)' : 360, width: '100%', flex: chRamTools.fullscreen ? 1 : undefined }} />
        </div>
      </div>

      {/* Disk pie + Disk table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={diskTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' } : { padding: 16 }}>
          <ChartToolbar fullscreen={diskTools.fullscreen} onSave={diskTools.save} onToggleFullscreen={diskTools.toggleFullscreen} isWantFeature={chartControlsFlags}/>
          {disks?.data?.length >= 0 && (
          <Select
            className="form-select conn-select"
            value={selectedDiskPieIndex}
            onChange={(e) => handleDiskPie(e.target.value)}
            style={{
              width:"100px",
              fontWeight: 600,
              height: "38px",
              fontSize: "13px",
            }}
            title="Switch cluster"
          ><option value={""}>--Select Disk--</option>
            {disks?.data?.map((c,i) => (
              <option key={c?.name} value={i}>
                {c?.name}
              </option>
            ))}
          </Select>
         )} 
          <div ref={diskEl} style={{ height: diskTools.fullscreen ? 'calc(100vh - 96px)' : 360, width: '100%', flex: diskTools.fullscreen ? 1 : undefined }} />
        </div>
        {disks.data?.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '15px', marginBottom: 12 }}>
              <Icon className="ti ti-device-floppy" /> Disk Details
            </h3>
            <DataTable
              rows={disks.data}
              
              columns={['name', 'total_fmt', 'free_fmt', 'used_pct']}
              variant="fixed"
              overView={true}
            />
          </div>
        )}
      </div>

      {/* Zookeeper + Connections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Zookeeper Connection */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: '15px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon className="ti ti-binary-tree" /> Zookeeper Connection
          </h3>
          {zk ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {[
                  ['Host',            `${zk.host}:${zk.port}`],
                  ['Session Uptime',  fmtZkUptime(zk.session_uptime_elapsed_seconds)],
                  ['Connected Since', zk.connected_time],
                  ['Status',          '_status_'],
                  ['Keeper API',      `v${zk.keeper_api_version}`],
                  ['Session Timeout', `${Math.round((Number(zk.session_timeout_ms) || 0) / 1000)}s`],
                  ['XID',             Number(zk.xid || 0).toLocaleString()],
                  ['Features',        Array.isArray(zk.enabled_feature_flags)
                                        ? zk.enabled_feature_flags.join(', ')
                                        : String(zk.enabled_feature_flags || '-')],
                ].map(([label, val], i) => (
                  <tr key={i}>
                    <td style={{
                      padding: '5px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                      width: '40%', borderBottom: '1px dotted var(--border-default)',
                      fontFamily: 'var(--font-code)', fontSize: '12px',
                    }}>{label}</td>
                    <td style={{
                      padding: '5px 8px', borderBottom: '1px dotted var(--border-default)',
                      fontFamily: 'var(--font-code)', fontSize: '12px', wordBreak: 'break-word',
                    }}>
                      {val === '_status_' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: zk.is_expired == 1
                              ? 'var(--color-danger)'
                              : 'var(--color-success)',
                          }} />
                          {zk.is_expired == 1 ? 'Expired' : 'Active'}
                        </span>
                      ) : val}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{
              color: 'var(--text-muted)', fontSize: '13px',
              fontStyle: 'italic', padding: '12px 0',
            }}>
              {zookeeper.loading
                ? 'Loading...'
                : zookeeper.error
                  ? 'Zookeeper / Keeper not configured or inaccessible'
                  : 'No connection data'}
            </div>
          )}
        </div>

        {/* Active Connections */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: '15px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon className="ti ti-plug-connected" /> Active Connections
            {totalConns > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '13px', fontWeight: 700,
                fontFamily: 'var(--font-chart)', color: 'var(--accent)',
              }}>{totalConns} total</span>
            )}
          </h3>
          {conns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {conns.map(c => {
                const val = Number(c.value) || 0;
                const label = c.metric.replace('Connection', '');
                const maxVal = Math.max(...conns.map(x => Number(x.value) || 0), 1);
                const pct = (val / maxVal) * 100;
                return (
                  <div key={c.metric} style={{
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px',
                  }}>
                    <span style={{
                      width: 120, fontFamily: 'var(--font-code)', fontSize: '12px',
                      color: 'var(--text-muted)', flexShrink: 0,
                    }}>{label}</span>
                    <div style={{
                      flex: 1, height: 22, background: 'var(--bg-sunken)',
                      borderRadius: 4, overflow: 'hidden',
                    }}>
                      {val > 0 && (
                        <div style={{
                          width: `${Math.max(pct, 8)}%`, height: '100%',
                          background: 'var(--accent)', borderRadius: 4,
                          transition: 'width 0.3s ease',
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                          paddingRight: 6,
                        }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 600, color: '#fff',
                            fontFamily: 'var(--font-chart)',
                          }}>{val}</span>
                        </div>
                      )}
                    </div>
                    {val === 0 && (
                      <span style={{
                        width: 24, textAlign: 'right', fontFamily: 'var(--font-chart)',
                        fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)',
                      }}>0</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              color: 'var(--text-muted)', fontSize: '13px',
              fontStyle: 'italic', padding: '12px 0',
            }}>
              {connections.loading ? 'Loading...' : 'No connection data'}
            </div>
          )}
        </div>
      </div>

      {/* Clusters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: '15px', marginBottom: 12 }}>
          <Icon className="ti ti-topology-star-3" /> Clusters
        </h3>
        <DataTable
          rows={clusters.data || []}
          columns={['cluster', 'host_name', 'ip', 'shard', 'replica', 'errors_count', 'slowdowns_count']}
          emptyMessage="No cluster data."
          variant="fixed"
        />
      </div>

      {/* Readonly replicas detail */}
      {hasReadonly && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: '15px', marginBottom: 12 }}>
            <Icon className="ti ti-lock" /> Readonly Replicas
          </h3>
          <DataTable
            rows={readonlyReplicas.data || []}
            columns={['database', 'table', 'readonly_start_time']}
            variant="fixed"
          />
        </div>
      )}
    </div>
  );
}
