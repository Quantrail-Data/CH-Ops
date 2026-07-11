// Sidebar - Main navigation sidebar with collapsible sections
//
// The primary navigation component for CHOps. It renders all core sections
// (Overview, Tools, Dashboards, Monitoring, Logs, Schema, Alerts, RBAC,
// Backups, Admin)
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useMemo, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { useLocation } from "react-router-dom";
import {useTheme} from "../../App.jsx"

const CORE_NAV_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    icon: "ti-eye",
    children: [
      { id: "overview/cluster", label: "Cluster Overview" },
      { id: "overview/summary", label: "Daily Summary" },
      { id: "overview/queries", label: "Queries" },
      { id: "overview/parts", label: "Tables & Parts" },
      { id: "overview/operations", label: "Merges & Mutations" },
      { id: "overview/queues",label:"Queues"  },
      { id: "overview/ddl", label: "DDL & Readonly" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: "ti-terminal-2",
    children: [
      { id: "editor/query", label: "SQL Editor" },
      { id: "tools/profiler", label: "Query Profiler" },
      { id: "tools/pipeline", label: "Processors Profile" },
      { id: "tools/metrics", label: "Query Metrics" },
      { id: "tools/schema-studio", label: "Schema Studio" },
      { id: "tools/qurioz", label: "Qurioz AI" }
    ],
  },
  {
    id: "custom",
    label: "Dashboards",
    icon: "ti-chart-pie",
    children: [
      { id: "custom/builder", label: "Chart Builder" },
      { id: "custom/dashboards", label: "My Dashboards" },
      { id: "custom/charts", label: "All Charts" },
    ],
  },
  // {
  //   id: "qurioz",
  //   label: "qurioz",
  //   icon: "ti ti-sparkles-2",
  //   children: [{ id: "/qurioz", label: "AI Qurioz" }],
  // },
  {
    id: "monitoring",
    label: "Monitoring",
    icon: "ti-activity-heartbeat",
    children: [
      { id: "monitoring/dashboards", label: "System Dashboards" },
      { id: "monitoring/playback", label: "Playback" },
      { id: "monitoring/allocator", label: "Memory Allocator" },
    ],
  },
  {
    id: "logs",
    label: "Logs",
    icon: "ti-file-smile",
    children: [
      { id: "logs/crash", label: "Crash Log" },
      { id: "logs/error", label: "Error Log" },
      { id: "logs/text", label: "Text Log" },
      { id: "logs/session", label: "Session Log" },
    ],
  },
  {
    id: "indexes",
    label: "Schema",
    icon: "ti-database",
    children: [
      { id: "indexes/visualizer", label: "Schema Visualizer" },
      { id: "indexes/secondary", label: "Data Skipping Indexes" },
      { id: "indexes/projections", label: "Projections" },
      { id: "indexes/create", label: "Index Management" },
    ],
  },
  {
    id: "alerting",
    label: "Alerts",
    icon: "ti-bell",
    children: [
      { id: "alerting/rules", label: "Alert Rules" },
      { id: "alerting/channels", label: "Channels" },
    ],
  },
  // { id: 'logs', label: 'Logs', icon: 'ti-file-text', children: [
  //   { id: 'logs/crash', label: 'Crash Log' },
  //   { id: 'logs/error', label: 'Error Log' },
  //   { id: 'logs/text', label: 'Text Log' },
  // ]},
  {
    id: "rbac",
    label: "RBAC",
    icon: "ti-lock",
    children: [
      { id: "rbac/view", label: "View Grants" },
      { id: "rbac/users", label: "Users" },
      { id: "rbac/roles", label: "Roles" },
      { id: "rbac/profiles", label: "Settings Profiles" },
    ],
  },
  {
    id: "backups",
    label: "Backups",
    icon: "ti-shield-check",
    children: [{ id: "backups/lifecycle", label: "Data Lifecycle" }],
  },
  // { id: 'rbac', label: 'RBAC', icon: 'ti-lock', children: [
  //   { id: 'rbac/view', label: 'View Grants' },
  //   { id: 'rbac/users', label: 'Users' },
  //   { id: 'rbac/roles', label: 'Roles' },
  //   { id: 'rbac/profiles', label: 'Settings Profiles' },
  // ]},
  {
    id: "admin",
    label: "Admin",
    icon: "ti-adjustments-horizontal",
    children: [
      { id: "admin/users", label: "User Management" },
      { id: "admin/cluster", label: "Cluster Management" },
      { id: "admin/profiles", label: "Storage Profiles" },
      { id: "admin/app-backup", label: "App Data Backup" },
      { id: "admin/api-management", label: "AI API Keys" },
    ],
  },
];

export default function Sidebar({
  currentRoute,
  onNavigate,
  collapsed,
  onToggle,
  forceCollapsed,
}) {
  const isCollapsed = forceCollapsed || collapsed;
  const location = useLocation();

  const NAV_ITEMS = CORE_NAV_ITEMS;

  const [openSections, setOpenSections] = useState(() => {
    const segment = location.pathname.split("/")[1]?.toLowerCase();
    const initial = {};
    NAV_ITEMS.forEach((s) => {
      initial[s.id] = segment ? s.id === segment : s.id === "overview";
    });
    return initial;
  });

  const {theme} = useTheme();

   function isDark(){
    return theme === 'dark'
   }

  useEffect(() => {
    const route = (currentRoute || "").toLowerCase();
    const pathSegment = location.pathname.split("/")[1]?.toLowerCase();
    const activeSection =
      NAV_ITEMS.find(
        (s) =>
          s.id === pathSegment ||
          s.children?.some((c) => c.id.toLowerCase() === route),
      )?.id ||
      (pathSegment && NAV_ITEMS.some((s) => s.id === pathSegment)
        ? pathSegment
        : "overview");

    const next = {};
    NAV_ITEMS.forEach((s) => {
      next[s.id] = s.id === activeSection;
    });
    setOpenSections(next);
  }, [location.pathname, currentRoute, NAV_ITEMS]);

  function toggleSection(id) {
    const next = {};
    Object.keys(openSections).forEach((key) => {
      next[key] = key === id ? !openSections[key] : false;
    });
    setOpenSections(next);
  }

  function handleSectionClick(sectionId) {
    if (isCollapsed) {
      onToggle();
      const next = {};
      Object.keys(openSections).forEach((key) => {
        next[key] = key === sectionId;
      });
      setOpenSections(next);
    } else {
      toggleSection(sectionId);
    }
  }

  function navigateTo(itemId, sectionId) {
    onNavigate(itemId);
  }

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-scroll">
        {NAV_ITEMS.map((section) => (
          <div key={section.id}>
            <div
              className="sidebar-section-header"
              onClick={() => handleSectionClick(section.id)}
              title={isCollapsed ? section.label : undefined}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 15,
                userSelect: "none",
              }}
            >
              <span
                className="sidebar-section-icon"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // width: 25,
                  // height: 25,
                  borderRadius: 5,
                  flexShrink: 0,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                <Icon
                  className={`ti ${section.icon}`}
                  style={{ fontSize:24, color: isDark() ? "white" : "black" }}
                />
              </span>
              {!isCollapsed && (
                <>
                  <span style={{ flex: 1, fontSize:"13px",fontWeight:"700"  }}>{section.label}</span>
                  <Icon
                    className={`ti ti-chevron-${openSections[section.id] ? "down" : "right"}`}
                    style={{ fontSize: 12, opacity: 0.5 }}
                  />
                </>
              )}
            </div>
            {isCollapsed && (
              <div
                className={`sidebar-item ${openSections[section.id] ? "active" : ""}`}
                onClick={() => handleSectionClick(section.id)}
                title={section.label}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <span
                  className="sidebar-section-icon"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34.5,
                    height: 34.5,
                    borderRadius: 5,
                    flexShrink: 0,
                    transition: "background 0.2s, color 0.2s",
                  }}
                >
                                   <Icon
                    className={`ti ${section.icon}`}
                    style={{ fontSize:28, color: isDark() ? "white" : "black" }}
                  />
                </span>
              </div>
            )}
            {!isCollapsed &&
              openSections[section.id] &&
              section.children.map((item) =>
                item?.id === "/qurioz" ? (
                  <div
                    key={item.id}
                    className={`sidebar-item ${currentRoute === item.id?.replace("/", "") ? "active" : ""}`}
                    onClick={() => navigateTo(item.id, section.id)}
                    style={{marginLeft:"10px"}}
                  >
                    <span style={{fontSize:"14px"}}>{item.label}</span>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className={`sidebar-item ${currentRoute === item.id ? "active" : ""}`}
                    onClick={() => navigateTo(item.id, section.id)}
                         style={{marginLeft:"10px"}}
                  >
                   <span style={{fontSize:"14px"}}>{item.label}</span>
                  </div>
                ),
              )}
          </div>
        ))}
      </div>
      <button className="sidebar-toggle" onClick={onToggle}>
        <Icon
          className={`ti ${isCollapsed ? "ti-chevron-right" : "ti-chevron-left"}`}
        />
        {!isCollapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
