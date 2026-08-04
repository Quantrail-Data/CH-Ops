// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan
// High-level monitoring dashboard displaying the real-time status, health, and utilization of all cluster nodes.


import React, { useState, useEffect, useCallback, useRef } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useQuery } from '../../hooks/useQuery.js';
import { useConnection } from '../../App.jsx';
import DataTable from '../layout/DataTable.jsx';
import { initChart, disposeChart } from '../../utils/echarts.js';
import { fmtBytes } from '../../utils/costEstimator.js';
import ChartToolbar, { useChartTools } from '../common/ChartToolbar.jsx';
import ClusterTopology from './ClusterTopology.jsx';
import { Section } from './OverviewCards.jsx';
import { SERIES_COLORS } from './overviewChart.js';
import LiveOverview, { useLiveOverview, LiveControlBar, MachineGauges } from './LiveOverview.jsx';

const SLOW_REFRESH_MS = 30000;


function isDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function StatCard({ icon, label, value, iconColor }) {
  return (
    <div className="stat-card" style={{ padding: '10px 12px', minWidth: 0 }}>
      <div className="stat-card-icon">
        <Icon className={`ti ${icon}`} style={{ color: iconColor, fontSize: 15 }} />
      </div>
      <div className="stat-card-content" style={{ minWidth: 0 }}>
        <div className="stat-card-label" style={{ fontSize: '0.6875rem', marginBottom: 2 }}>
          {label}
        </div>
        <div
          className="stat-card-value"
          style={{
            fontSize: '0.9375rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={value == null ? '-' : String(value)}
        >
          {value ?? '-'}
        </div>
      </div>
    </div>
  );
}


/*  Format uptime seconds into "X Days, Y Hrs and Z Mins"              */

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
      formatter: ({ name, value, percent }) => {
        const n = Number(value);
        const safeValue = Number.isFinite(n) ? n : 0;
        return `${name}: ${fmtBytes(safeValue)} (${percent}%)`;
      },
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

  const liveState = useLiveOverview();

  const connection = useConnection() || {};
  const selectedHost = connection.selectedNode || null;
  const selectedNodeName = connection.nodeName || selectedHost || 'This node';

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
  const zookeeper        = useQuery();
  const connections      = useQuery();

  /* Chart refs */

  const diskEl    = useRef(null);
  const [diskElVersion, setDiskElVersion] = useState(0);
  const attachDiskEl = useCallback((node) => {
    diskEl.current = node;
    setDiskElVersion((n) => n + 1);
  }, []);
  const diskInst  = useRef(null);

  // Chart toolbars: save and full screen, no zoom, because these are pies.
  const diskTools  = useChartTools(() => diskInst.current, { filename: 'Disk' });
  useEffect(() => { const t = setTimeout(() => diskInst.current?.resize(), 150); return () => clearTimeout(t); }, [diskTools.fullscreen]);

  /* Theme key, bumped when the theme flips so the pies rebuild with new colours */
  const [themeKey, setThemeKey] = useState(0);

  /* Which disk the pie is showing.*/
  const [diskIndex, setDiskIndex] = useState(0);


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
    // SELECT * rather than a column list, deliberately.
    clusters.execute(`
      SELECT * FROM system.clusters
      ORDER BY cluster, shard_num, replica_num
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
    zookeeper.execute('SELECT * FROM system.zookeeper_connection');
    connections.execute(
      "SELECT metric, value FROM system.metrics WHERE metric LIKE '%Connection' ORDER BY value DESC"
    );
  }, []);

  /* Auto-refresh */
  useEffect(() => {
    load();
    const interval = setInterval(load, SLOW_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  /* Theme observer */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (diskEl.current) disposeChart(diskEl.current);
      diskInst.current = null;
      setThemeKey(k => k + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const count = disks.data?.length || 0;
    if (count === 0) return;
    if (diskIndex >= count) setDiskIndex(0);
  }, [disks.data, diskIndex]);


  useEffect(() => {
    const rows = disks.data;
    if (!rows?.length) return;
    const d = rows[diskIndex] ?? rows[0];
    if (!d) return;
    const total = Number(d.total_space) || 0;
    const free = Number(d.free_space) || 0;
    renderPie(diskInst, diskEl, `Disk: ${d.name}`, [
      { value: Math.max(0, total - free), name: 'Used', itemStyle: { color: '#f59e0b' } },
      { value: free,                      name: 'Free', itemStyle: { color: '#34d399' } },
    ]);
  }, [disks.data, diskIndex, themeKey, diskElVersion]);

  /* Resize */
  useEffect(() => {
    const onResize = () => {
      diskInst.current?.resize();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Cleanup */
  useEffect(() => () => {
    if (diskEl.current) disposeChart(diskEl.current);
  }, []);

  /* Derived */
  const zk = zookeeper.data?.[0];
  const conns = connections.data || [];
  const totalConns = conns.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  const readonlyVal = readonlyCount.data?.[0]?.cnt;
  const hasReadonly = Number(readonlyVal) > 0;

  const zkLastLoss = Number(zk?.ZooKeeperConnectionLossStartedTimestampSeconds) || 0;

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

  const chartControlsFlags = {
    zoomFun: false,
    resetFun: false,
    saveFun: true,
    fullscreenFun: true,
  };

  return (
    <div className="page-content">
      <LiveControlBar nodeName={selectedNodeName} live={liveState} />

      <Section id="node-cards" icon="ti-topology-star" title="Node Overview">
      {/* auto-fit rather than a fixed four across, so the row reflows from
          eight wide on a monitor down to two on a laptop instead of squeezing */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
        gap: 10, marginBottom: 16,
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
      </Section>

      {/* Directly under the stat cards, and open by default. Together they say
          which node this is and whether it is under load, which is what the top
          of the page is for. */}
      <MachineGauges live={liveState} />

      {/* Disk pie and disk table. Reference information rather than the
          headline, so it takes a third of the width and a shorter chart. */}
      <Section id="disks" icon="ti-device-floppy" title="Disks" defaultOpen={false}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.4fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={diskTools.fullscreen ? { padding: 16, position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' } : { padding: 16 }}>
          <ChartToolbar fullscreen={diskTools.fullscreen} onSave={diskTools.save} onToggleFullscreen={diskTools.toggleFullscreen} isWantFeature={chartControlsFlags} />

          {/* Only offered when there is more than one disk to choose between,
              and with no empty placeholder option: selecting it used to leave
              the pie drawing NaN segments. */}
          {disks.data?.length > 1 && (
            <Select
              className="form-select conn-select"
              value={diskIndex}
              onChange={(e) => setDiskIndex(Number(e.target.value))}
              style={{ width: 160, fontWeight: 600, height: '38px', fontSize: '13px' }}
              title="Switch disk"
            >
              {disks.data.map((d, i) => (
                <option key={d.name} value={i}>{d.name}</option>
              ))}
            </Select>
          )}

          <div ref={attachDiskEl} style={{ height: diskTools.fullscreen ? 'calc(100vh - 96px)' : 210, width: '100%', flex: diskTools.fullscreen ? 1 : undefined }} />
        </div>

        {disks.data?.length > 0 && (
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: 8 }}>
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
      </Section>

      {/* Cluster topology */}
      {/* Gauge readings are current; anything derived from system.events covers
          exactly one refresh interval. There are no time series charts on this
          page by design. The controls for all of it are at the top. */}
      <LiveOverview live={liveState} />

      {/* Zookeeper and Connections */}
      <Section id="keeper-connections" icon="ti-plug-connected" title="Keeper and connections" defaultOpen={false}>
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
                  ['Last Connection Loss',
                    zkLastLoss > 0 ? new Date(zkLastLoss * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'never'],
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
                fontFamily: 'var(--font-chart)', color: 'var(--text-primary)',
              }}>{totalConns} total</span>
            )}
          </h3>
          {conns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {conns.map((c, i) => {
                const val = Number(c.value) || 0;
                // Same palette the charts use, one colour per protocol. A single
                // accent for every bar made this panel look unrelated to
                // everything else on the page.
                const barColor = SERIES_COLORS[i % SERIES_COLORS.length];
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
                          background: barColor, borderRadius: 4,
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
      </Section>

      {/* Readonly replicas detail */}
      {hasReadonly && (
        <Section id="readonly" icon="ti-lock" title="Readonly replicas" summary={`${readonlyVal} affected`} defaultOpen={false}>
        <div className="card" style={{ padding: 16 }}>
          <DataTable
            rows={readonlyReplicas.data || []}
            columns={['database', 'table', 'readonly_start_time']}
            variant="fixed"
          />
        </div>
        </Section>
      )}

      {/* Last on the page. The topology changes only when someone edits the
          cluster configuration, so it has the weakest claim on the space near
          the top. It collapses itself and stays collapsed by default. */}
      <ClusterTopology
        rows={clusters.data}
        loading={clusters.loading}
        selectedHost={selectedHost}
      />
    </div>
  );
}
