// Contributors -> kathir dhasan
// Sidebar.jsx - main navigation sidebar with collapsible sections
// Built with real buttons, the shadcn/ui Collapsible for each section and the
// shadcn Tooltip for the icon-only (collapsed) mode, so the sidebar works
// with the keyboard and screen readers. The CSS classes (.sidebar-item and
// others) still give the look.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import ClusterSwitcher, { SidebarBrand } from "./ClusterSwitcher.jsx";
import { useLocation } from "react-router-dom";
import { useTheme } from "../../App.jsx";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../ui/collapsible.jsx";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip.jsx";

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
      { id: "overview/kubernetes", label: "Kubernetes Insights" },
      { id: "overview/ddl", label: "DDL & Readonly" },
    ],
  },
  {
    id: "tools",
    label: "SQL Tools",
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
    label: "Custom Dashboards",
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
    label: "Schema Tools",
    icon: "ti-database",
    children: [
      { id: "indexes/visualizer", label: "Schema Visualizer" },
      { id: "indexes/secondary", label: "Data Skipping Indexes" },
      { id: "indexes/projections", label: "Projections" },
      { id: "indexes/create", label: "Index Management" },
    ],
  },
  // {
  //   id: "alerting",
  //   label: "Alerts",
  //   icon: "ti-bell",
  //   children: [
  //     { id: "alerting/rules", label: "Alert Rules" },
  //     { id: "alerting/channels", label: "Channels" },
  //   ],
  // },

  {
    id: "alerting",
    label: "Custom Alerts",
    icon: "ti-bell",
    children: [{ id: "alerting/rules", label: "Alert Rules" }],
  },
  // { id: 'logs', label: 'Logs', icon: 'ti-file-text', children: [
  //   { id: 'logs/crash', label: 'Crash Log' },
  //   { id: 'logs/error', label: 'Error Log' },
  //   { id: 'logs/text', label: 'Text Log' },
  // ]},
  {
    id: "rbac",
    label: "DB RBAC",
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
  // {
  //   id: "admin",
  //   label: "Admin",
  //   icon: "ti-adjustments-horizontal",
  //   children: [
  //     { id: "admin/users", label: "User Management" },
  //     { id: "admin/cluster", label: "Cluster Management" },
  //     { id: "admin/profiles", label: "Storage Profiles" },
  //     { id: "admin/app-backup", label: "App Data Backup" },
  //     { id: "admin/api-management", label: "AI API Keys" },
  //   ],
  // },
  {
    id: "admin",
    label: "Control panel",
    icon: "ti-adjustments-horizontal",
    children: [
      { id: "admin/users", label: "User Management" },
      { id: "admin/cluster", label: "Cluster Management" },
      { id: "admin/profiles", label: "Storage Profiles" },
      { id: "admin/channels", label: "Notification Channels" },
      { id: "admin/trusted-cas", label: "Trusted CAs" },
      { id: "admin/app-config", label: "App Config" },
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
  onRefresh,
}) {
  const isCollapsed = forceCollapsed || collapsed;
  const location = useLocation();

  const NAV_ITEMS = CORE_NAV_ITEMS;
  const {theme} = useTheme()

  const [openSections, setOpenSections] = useState(() => {
    const segment = location.pathname.split("/")[1]?.toLowerCase();
    const initial = {};
    NAV_ITEMS.forEach((s) => {
      initial[s.id] = segment ? s.id === segment : s.id === "overview";
    });
    return initial;
  });



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

    // On the Home page every section stays closed.
    const isHomePage = pathSegment === "home";
    const next = {};
    NAV_ITEMS.forEach((s) => {
     next[s.id] = !isHomePage && s.id === activeSection;
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

  // eslint-disable-next-line no-unused-vars -- tests/frontend/sidebar-routing.test.js checks this signature.
  function navigateTo(itemId, sectionId) {
    onNavigate(itemId);
  }

  // In the collapsed sidebar, a tooltip shows the name of each icon.
  function withTooltip(label, button) {
    if (!isCollapsed) return button;
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <SidebarBrand collapsed={isCollapsed} theme={theme}/>
          <ClusterSwitcher collapsed={isCollapsed} onRefresh={onRefresh} />
        </div>
        <nav className="sidebar-scroll" aria-label="Main">
          {withTooltip(
            "Home",
            <button
              type="button"
              className={`sidebar-item ${currentRoute === "home" ? "active" : ""}`}
              aria-current={currentRoute === "home" ? "page" : undefined}
              onClick={() => onNavigate("home")}
            >
              <Icon className="ti ti-home" />
              <span>Home</span>
            </button>,
          )}
          {NAV_ITEMS.map((section) => (
            <Collapsible
              key={section.id}
              className="sidebar-group"
              open={!isCollapsed && Boolean(openSections[section.id])}
              onOpenChange={() => handleSectionClick(section.id)}
            >
              {isCollapsed ? (
                withTooltip(
                  section.label,
                  <button
                    type="button"
                    className={`sidebar-item ${openSections[section.id] ? "active" : ""}`}
                    aria-label={section.label}
                    onClick={() => handleSectionClick(section.id)}
                  >
                    <Icon className={`ti ${section.icon}`} />
                  </button>,
                )
              ) : (
                <CollapsibleTrigger
                  className={`sidebar-section-header ${openSections[section.id] ? "open" : ""}`}
                >
                  <span className="sidebar-section-icon">
                    <Icon className={`ti ${section.icon}`} />
                  </span>
                  <span className="sidebar-section-label">{section.label}</span>
                  <Icon
                    className={`ti ti-chevron-${openSections[section.id] ? "down" : "right"}`}
                  />
                </CollapsibleTrigger>
              )}
              <CollapsibleContent className="sidebar-children">
                {section.children.map((item) => {
                  const itemRoute = item.id === "/qurioz" ? item.id.replace("/", "") : item.id;
                  const isActive = currentRoute === itemRoute;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`sidebar-item ${isActive ? "active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => navigateTo(item.id, section.id)}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </nav>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon
            className={`ti ${isCollapsed ? "ti-chevron-right" : "ti-chevron-left"}`}
          />
          {!isCollapsed && <span>Collapse</span>}
        </button>
      </aside>
    </TooltipProvider>
  );
}
