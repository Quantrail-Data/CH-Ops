// HomePage.jsx - Landing page after login. Each card opens one part of theapp.
// Copyright (C) 2026 Quantrail Data Private Limited
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../common/Icon.jsx";
import { useAuth, useConnection } from "../../App.jsx";
import { runQuery, apiFetch } from "../../utils/api.js";
import { requestGlobalSearch } from "../layout/GlobalSearch.jsx";
import { Badge, Kbd, KpiCard, StatusDot, shortcutLabel } from "../ui/index.jsx";
import "./home.css";
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
// One card per task. minRole hides the card from users below that role,
// because those pages only show an "administrators only" message to them.
export const HOME_CARDS = [
 {
 title: "Check cluster health",
 description: "Node status, disk, memory, Keeper and readonly tables.",
 icon: "ti-heartbeat",
 page: "overview/cluster",
 },
 {
 title: "Write and run SQL",
 description: "Run and compare queries, bookmark them and export results.",
 icon: "ti-terminal-2",
 page: "editor/query",
 },
 {
 title: "Ask in plain English",
 description: "Qurioz AI turns your question into ClickHouse SQL.",
 icon: "ti-sparkles-2",
 page: "tools/qurioz",
 },
 {
 title: "Design a new table",
 description: "A guided designer that writes correct MergeTree DDL.",
 icon: "ti-table",
 page: "tools/schema-studio",
 },
 {
 title: "Profile a slow query",
 description: "Flame graphs that show where one query spends its time.",
 icon: "ti-flame",
 page: "tools/profiler",
 },
 {
 title: "Build your own dashboards",
 description: "Make charts from your data and group them on a dashboard.",
 icon: "ti-layout-dashboard",
 page: "custom/dashboards",
 },
 {
 title: "Track resource use",
 description: "CPU, memory, disk and network charts over time.",
 icon: "ti-chart-line",
 page: "monitoring/dashboards",
 },
 {
title: "Read server logs",
 description: "Errors, crashes, text logs and user sessions.",
 icon: "ti-file-text",
 page: "logs/error",
 },
 {
 title: "Explore schemas and indexes",
 description: "Table diagrams, data skipping indexes and projections.",
 icon: "ti-hierarchy-2",
 page: "indexes/visualizer",
 },
 {
 title: "Get alerted on problems",
 description: "Rules that check the cluster and send notifications.",
 icon: "ti-bell",
 page: "alerting/rules",
 },
 {
 title: "Control database access",
 description: "ClickHouse users, roles, grants and settings profiles.",
 icon: "ti-shield-lock",
 page: "rbac/view",
 },
 {
 title: "Inspect Kubernetes",
 description:
 "Topology, storage, events and pod logs of your ClickHouse pods.",
 icon: "ti-topology-star-3",
 page: "overview/kubernetes",
 minRole: "admin",
 },
 {
 title: "Protect your data",
 description: "Backups, TTL, retention and restore to S3 storage.",
 icon: "ti-shield-check",
 page: "backups/lifecycle",
 minRole: "admin",
 },
 {
 title: "Manage CHOps",
 description: "App users, clusters, notification channels and settings.",
 icon: "ti-adjustments-horizontal",
 page: "admin/users",
 minRole: "admin",
 },
];
export function getVisibleCards(role) {
 const userLevel = ROLE_LEVEL[role] || 0;
 return HOME_CARDS.filter((card) => {
 if (!card.minRole) return true;
 return userLevel >= ROLE_LEVEL[card.minRole];
 });
}
// Read-only cluster pulse for the KPI row. Queried once per connect; every
// value fails soft to "-" so Home never blocks on a slow or locked-down server.
const PULSE_SQL = `SELECT
  round(countIf(type = 'QueryStart' AND event_time > now() - 60) / 60, 1) AS qps,
  countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failed
FROM system.query_log
WHERE event_date >= yesterday() AND event_time > now() - 3600`;

function useClusterPulse(connected, clusterId) {
  const [pulse, setPulse] = useState({ qps: null, failed: null, firing: null });
  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;
    (async () => {
      const next = { qps: null, failed: null, firing: null };
      try {
        const res = await runQuery(PULSE_SQL, { readOnly: true });
        const row = res?.rows?.[0] || {};
        next.qps = row.qps ?? null;
        next.failed = row.failed ?? null;
      } catch {
        // query_log can be disabled; the tiles show "-".
      }
      try {
        const rules = await apiFetch("/api/alerts/rules");
        if (Array.isArray(rules)) next.firing = rules.filter((r) => r.isActive).length;
      } catch {
        // Not every role can read alert rules.
      }
      if (!cancelled) setPulse(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, clusterId]);
  return pulse;
}

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const fmtNum = (v) => (v === null || v === undefined || v === "" ? "-" : Number(v).toLocaleString());

export default function HomePage() {
  const { auth } = useAuth();
  const { nodes = [], connected, selectedClusterId } = useConnection();
  const cards = getVisibleCards(auth?.role);
  const pulse = useClusterPulse(connected, selectedClusterId);
  const [featured, ...rest] = cards;

  return (
    <div className="page-content home">
      <div className="home-hero">
        <div style={{ minWidth: 0 }}>
          <div className="home-greeting">
            {greeting()}
            {auth?.username ? `, ${auth.username}` : ""}
          </div>
          <h1 className="page-title home-title">What do you want to do today?</h1>
        </div>
        <button type="button" className="navbar-search home-search" onClick={requestGlobalSearch}>
          <Icon className="ti ti-search" />
          <span className="navbar-search-label">Jump to a page, table or query</span>
          <Kbd>{shortcutLabel("K")}</Kbd>
        </button>
      </div>

      <div className="home-kpis">
        <KpiCard
          label="Nodes online"
          value={nodes.length ? `${connected ? nodes.length : 0} / ${nodes.length}` : "-"}
          aside={
            nodes.length ? (
              <Badge tone={connected ? "success" : "danger"}>{connected ? "Healthy" : "Disconnected"}</Badge>
            ) : null
          }
        />
        <KpiCard label="Queries per second" value={fmtNum(pulse.qps)} />
        <KpiCard
          label="Failed queries, 1 h"
          value={fmtNum(pulse.failed)}
          aside={
            pulse.failed > 0 ? (
              <Link to="/overview/queries" className="home-kpi-link">
                <Badge tone="warning">Review</Badge>
              </Link>
            ) : null
          }
        />
        <KpiCard
          label="Firing alerts"
          value={fmtNum(pulse.firing)}
          aside={
            pulse.firing > 0 ? (
              <Link to="/alerting/rules" className="home-kpi-link">
                <Badge tone="danger">Open</Badge>
              </Link>
            ) : null
          }
        />
      </div>

      <div className="home-grid">
        {featured && (
          <Link to={"/" + featured.page} className="card home-card home-card-featured">
            <span className="home-card-icon">
              <Icon className={`ti ${featured.icon}`}></Icon>
            </span>
            <span className="home-card-title">{featured.title}</span>
            <span className="home-card-description">{featured.description}</span>
            {nodes.length > 0 && (
              <span className="home-node-chips">
                {nodes.slice(0, 3).map((n) => (
                  <span key={n.name || n.host} className="home-node-chip">
                    <span className="home-node-chip-name">
                      <StatusDot tone={connected ? "success" : "danger"} />
                      {n.name || n.host}
                    </span>
                    <span className="home-node-chip-meta">{n.host}</span>
                  </span>
                ))}
              </span>
            )}
          </Link>
        )}
        {rest.map((card) => (
          <Link key={card.page} to={"/" + card.page} className="card home-card">
            <span className="home-card-icon">
              <Icon className={`ti ${card.icon}`}></Icon>
            </span>
            <span className="home-card-title">{card.title}</span>
            <span className="home-card-description">{card.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
