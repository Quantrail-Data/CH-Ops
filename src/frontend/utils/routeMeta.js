// routeMeta - shared route metadata (breadcrumb trail per route path).
//
// Extracted from MainLayout so both the layout breadcrumb and the global
// search catalog can consume the same constant without a circular import.
// These section / page / tab labels are also folded into the search index
// (see searchCatalog.js), so every breadcrumb term becomes searchable.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

export const BREADCRUMB_MAP = {
  "overview/cluster": ["Overview", "Cluster Overview"],
  "overview/summary": ["Overview", "Daily Summary"],

  "overview/queries": ["Overview", "Queries"],
  "overview/queries/current": ["Overview", "Queries", "Current"],
  "overview/queries/analytics": ["Overview", "Queries", "Analytics"],
  "overview/queries/search": ["Overview", "Queries", "Search"],

  "overview/parts": ["Overview", "Tables & Parts"],
  "overview/operations": ["Overview", "Merges & Mutations"],
  "overview/ddl": ["Overview", "DDL & Readonly"],
  "overview/queues": ["Overview", "Queues"],

  "editor/query": ["Tools", "SQL Editor"],
  "tools/profiler": ["Tools", "Query Profiler"],
  "tools/pipeline": ["Query Tools", "Processors Profile"],
  "tools/metrics": ["Tools", "Query Metrics"],
  "tools/schema-studio": ["Tools", "Schema Studio"],
  "custom/builder": ["Custom Dashboards", "Chart Builder"],
  "custom/dashboards": ["Custom Dashboards", "Dashboards"],
  "custom/charts": ["Custom Dashboards", "All Charts"],
  "indexes/visualizer": ["Schema", "Schema Visualizer"],
  "indexes/secondary": ["Indexes", "Data Skipping Indexes"],

  "indexes/projections": ["Indexes", "Projections"],
  "indexes/projections/view": ["Indexes", "Projections", "View"],
  "indexes/projections/add": ["Indexes", "Projections", "Add"],
  "indexes/projections/drop": ["Indexes", "Projections", "Drop"],
  "indexes/projections/materialize": ["Indexes", "Projections", "Materialize"],
  "indexes/projections/clear": ["Indexes", "Projections", "Clear"],

  "indexes/create": ["Indexes", "Index Management"],
  "indexes/create/create": ["Indexes", "Index Management", "Create"],
  "indexes/create/materialize": ["Indexes", "Index Management", "Materialize"],
  "indexes/create/drop": ["Indexes", "Index Management", "Drop"],

  "logs/crash": ["Logs", "Crash Log"],
  "logs/error": ["Logs", "Error Log"],
  "logs/text": ["Logs", "Text Log"],
  "logs/crash/overview": ["Logs", "Crash Log", "Overview"],
  "logs/crash/search": ["Logs", "Crash Log", "Search"],
  "logs/error/overview": ["Logs", "Error Log", "Overview"],
  "logs/error/search": ["Logs", "Error Log", "Search"],
  "logs/text/overview": ["Logs", "Text Log", "Overview"],
  "logs/text/search": ["Logs", "Text Log", "Search"],
  "logs/session": ["Logs", "Session Log"],
  "logs/session/overview": ["Logs", "Session Log", "Overview"],
  "logs/session/search": ["Logs", "Session Log", "Search"],

  "monitoring/dashboards": ["Monitoring", "Dashboards"],
  "monitoring/dashboards/queries": ["Monitoring", "Dashboards", "Queries"],

  "monitoring/dashboards/cpu": ["Monitoring", "Dashboards", "CPU"],
  "monitoring/dashboards/memory": ["Monitoring", "Dashboards", "Memory"],

  "monitoring/dashboards/disk": ["Monitoring", "Dashboards", "Disk & IO"],
  "monitoring/dashboards/merges": ["Monitoring", "Dashboards", "Merges & Part"],
  "monitoring/dashboards/network": ["Monitoring", "Dashboards", "Network"],
  "monitoring/dashboards/mem_drift": [
    "Monitoring",
    "Dashboards",
    "Memory Drift",
  ],
  "monitoring/dashboards/dist_cache": [
    "Monitoring",
    "Dashboards",
    "Dist Cache",
  ],

  "monitoring/playback": ["Monitoring", "Playback"],
  "monitoring/allocator": ["Monitoring", "Memory Allocator"],
  "alerting/rules": ["Alerting", "Alert Rules"],
  "rbac/view": ["Access Control", "View Grants"],
  "rbac/view/users": ["Access Control", "View Grants", "Users"],
  "rbac/view/roles": ["Access Control", "View Grants", "Role Grante"],
  "rbac/view/overview": ["Access Control", "View Grants", "Full Overview"],

  "rbac/users": ["Access Control", "Users"],
  "rbac/users/list": ["Access Control", "Users", "List"],
  "rbac/users/create": ["Access Control", "Users", "Create"],
  "rbac/users/alter": ["Access Control", "Users", "Alter"],
  "rbac/users/grant": ["Access Control", "Users", "Grant / Revoke"],
  "rbac/users/drop": ["Access Control", "Users", "Drop"],

  "rbac/roles": ["Access Control", "Roles"],
  "rbac/roles/list": ["Access Control", "Roles", "List"],
  "rbac/roles/create": ["Access Control", "Roles", "Create"],
  "rbac/roles/alter": ["Access Control", "Roles", "Alter"],
  "rbac/roles/grant": ["Access Control", "Roles", "Grant / Revoke"],
  "rbac/roles/drop": ["Access Control", "Roles", "Drop"],

  "rbac/profiles": ["Access Control", "Settings Profiles"],
  "rbac/profiles/list": ["Access Control", "Settings Profiles", "List"],
  "rbac/profiles/create": ["Access Control", "Settings Profiles", "Create"],
  "rbac/profiles/alter": ["Access Control", "Settings Profiles", "Alter"],
  "rbac/profiles/drop": ["Access Control", "Settings Profiles", "Drop"],

  "backups/lifecycle": ["Backups", "Data Lifecycle"],
  "admin/profiles": ["Administration", "Storage Profiles"],
  "admin/users": ["Administration", "User Management"],
  "admin/cluster": ["Administration", "Cluster Management"],
  "admin/app-backup": ["Administration", "App Data Backup"],
  "admin/api-management": ["Administration", "API Management"],
  "admin/channels": ["Administration", "Notification Channels"],
};
