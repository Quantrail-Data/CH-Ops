// HomePage.jsx - Landing page after login. Each card opens one part of theapp.
// Copyright (C) 2026 Quantrail Data Private Limited
import React from "react";
import { Link } from "react-router-dom";
import Icon from "../common/Icon.jsx";
import { useAuth } from "../../App.jsx";
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
export default function HomePage() {
 const { auth } = useAuth();
 const cards = getVisibleCards(auth?.role);
 return (
 <div className="page-content">
 <div className="section-header">
 <h2 className="section-title">
 <Icon className="ti ti-home"></Icon> Home
 </h2>
 </div>
 <p className="home-intro">What do you want to do?</p>
 <div className="home-grid">
 {cards.map((card) => (
 <Link key={card.page} to={"/" + card.page} className="card home-card">
 <span className="home-card-icon">
 <Icon className={`ti ${card.icon}`}></Icon>
 </span>
 <span className="home-card-title">{card.title}</span>
 <span className="home-card-description">{card.description}
</span>
 </Link>
 ))}
 </div>
 </div>
 );
}

 