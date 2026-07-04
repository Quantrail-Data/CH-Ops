// TablesAndParts - Overview of table storage and parts distribution
//
// Displays storage statistics from system.parts grouped by database and
// table. Shows compressed and uncompressed sizes, compression ratio,
// engine type, and active/inactive part counts. Stat cards at the top
// summarize active, inactive, detached, and broken parts, with horizontal
// bar breakdowns of broken and detached parts per database.table.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useEffect, useState, useMemo } from 'react';
import Icon from "../common/Icon.jsx";
import { useQuery } from '../../hooks/useQuery.js';
import DataTable from '../layout/DataTable.jsx';
import ChartCard from '../layout/ChartCard.jsx';
import { StatCard } from '../layout/SharedComponents.jsx';

const fmtInt = (n) => Number(n || 0).toLocaleString();

// Horizontal ranked bar: category labels (database.table) on the y-axis, count
// on the x-axis, one semantic colour per chart. Value labels sit to the right
// of each bar so exact counts stay readable. Colours are fixed hex because the
// ECharts canvas cannot read CSS variables; axis text colour comes from the
// registered light/dark theme applied by initChart.
function barOption(items, color) {
  const cats = items.map((d) => d.name);
  const vals = items.map((d) => d.value);
  const maxV = vals.reduce((a, b) => Math.max(a, b), 0);
  return {
    grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
      formatter: (p) => `${p[0].name}: ${fmtInt(p[0].value)}`,
    },
    xAxis: { type: 'value', max: maxV > 0 ? Math.ceil(maxV * 1.15) : 1, minInterval: 1 },
    yAxis: {
      type: 'category', inverse: true, data: cats,
      axisLabel: { width: 240, overflow: 'truncate', fontSize: 11 },
    },
    series: [{
      type: 'bar', barMaxWidth: 20,
      label: { show: true, position: 'right', formatter: (p) => fmtInt(p.value), fontSize: 11 },
      itemStyle: { color, borderRadius: [0, 3, 3, 0] },
      data: vals,
    }],
  };
}

const barHeight = (n) => Math.max(160, n * 30 + 40);

export default function TablesAndParts() {
  const tablesQ = useQuery(), activeQ = useQuery(), inactiveQ = useQuery(), detachedQ = useQuery(), brokenQ = useQuery(), brokenTableQ = useQuery(), detachedTableQ = useQuery();

  // Re-key the charts on theme change so the registered light/dark theme is
  // re-applied (ChartCard sets the theme once at mount and does not re-init).
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    tablesQ.execute("SELECT database, table, formatReadableSize(sum(data_compressed_bytes)) AS compressed, formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed, round((sum(data_compressed_bytes)/nullIf(sum(data_uncompressed_bytes),0))*100,1) AS compression_pct, round(sum(data_uncompressed_bytes)/nullIf(sum(data_compressed_bytes),0),2) AS ratio, any(engine) AS engine, countIf(active) AS active_parts, countIf(NOT active) AS inactive_parts, sum(rows) AS total_rows FROM system.parts GROUP BY database, table ORDER BY sum(data_compressed_bytes) DESC");
    activeQ.execute("SELECT count() AS cnt FROM system.parts WHERE active");
    inactiveQ.execute("SELECT count() AS cnt FROM system.parts WHERE NOT active");
    detachedQ.execute("SELECT count() AS cnt FROM system.detached_parts");
    brokenQ.execute("SELECT count() AS cnt FROM system.detached_parts WHERE startsWith(name, 'broken')");
    brokenTableQ.execute("SELECT database, table, count() AS broken_parts FROM system.detached_parts WHERE startsWith(name, 'broken') GROUP BY database, table ORDER BY broken_parts DESC LIMIT 20");
    detachedTableQ.execute("SELECT database, table, count() AS detached_parts FROM system.detached_parts GROUP BY database, table ORDER BY detached_parts DESC LIMIT 20");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brokenCount = parseInt(brokenQ.data?.[0]?.cnt) || 0;

  const brokenItems = useMemo(
    () => (brokenTableQ.data || []).map((r) => ({ name: `${r.database}.${r.table}`, value: Number(r.broken_parts) || 0 })),
    [brokenTableQ.data],
  );
  const detachedItems = useMemo(
    () => (detachedTableQ.data || []).map((r) => ({ name: `${r.database}.${r.table}`, value: Number(r.detached_parts) || 0 })),
    [detachedTableQ.data],
  );
  const brokenOption = useMemo(() => barOption(brokenItems, '#ef4444'), [brokenItems]);
  const detachedOption = useMemo(() => barOption(detachedItems, '#f59e0b'), [detachedItems]);

  if (tablesQ.loading && !tablesQ.data) return <div className="page-content"><div className="empty-state" style={{ padding: 40 }}><div className="loading-spinner"></div> Loading...</div></div>;

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-packages"></Icon> Tables & Parts</h2></div>
      <div className="stat-grid">
        <StatCard icon="ti-check" label="Active Parts" value={activeQ.data?.[0]?.cnt} color="var(--color-success)" />
        <StatCard icon="ti-x" label="Inactive Parts" value={inactiveQ.data?.[0]?.cnt} />
        <StatCard icon="ti-unlink" label="Detached Parts" value={detachedQ.data?.[0]?.cnt} color="var(--color-warning)" />
        <StatCard icon="ti-alert-triangle" label="Broken Parts" value={brokenQ.data?.[0]?.cnt} color={brokenCount > 0 ? 'var(--color-danger)' : undefined} />
      </div>

      {brokenItems.length > 0 && <>
        <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}><Icon className="ti ti-alert-triangle" style={{ color: 'var(--color-danger)', marginRight: 6 }}></Icon>Tables with Broken Parts (disk issues)</h3>
        <ChartCard key={`broken-${themeKey}`} title="Broken Parts by Table" height={barHeight(brokenItems.length)} option={brokenOption} />
        <div className="divider"></div>
      </>}

      {detachedItems.length > 0 && <>
        <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}><Icon className="ti ti-unlink" style={{ color: 'var(--color-warning)', marginRight: 6 }}></Icon>Detached Parts by Table</h3>
        <ChartCard key={`detached-${themeKey}`} title="Detached Parts by Table" height={barHeight(detachedItems.length)} option={detachedOption} />
        <div className="divider"></div>
      </>}

      <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}>Table Details</h3>
      <DataTable rows={tablesQ.data||[]} columns={['database','table','compressed','uncompressed','compression_pct','ratio','engine','active_parts','inactive_parts','total_rows']} emptyMessage="No table data." variant="fixed" />
    </div>
  );
}
