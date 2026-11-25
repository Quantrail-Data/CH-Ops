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

  "editor/query": ["SQL Tools", "SQL Editor"],
  "tools/profiler": ["SQL Tools", "Query Profiler"],
  "tools/pipeline": ["SQL Tools", "Processors Profile"],
  "tools/metrics": ["SQL Tools", "Query Metrics"],
  "tools/schema-studio": ["SQL Tools", "Schema Studio"],
  "custom/builder": ["Custom Dashboards", "Chart Builder"],
  "custom/dashboards": ["Custom Dashboards", "Dashboards"],
  "custom/charts": ["Custom Dashboards", "All Charts"],
  "indexes/visualizer": ["Schema Tools", "Schema Visualizer"],
  "indexes/secondary": ["Schema Tools", "Data Skipping Indexes"],

  "indexes/projections": ["Schema Tools", "Projections"],
  "indexes/projections/view": ["Schema Tools", "Projections", "View"],
  "indexes/projections/add": ["Schema Tools", "Projections", "Add"],
  "indexes/projections/drop": ["Schema Tools", "Projections", "Drop"],
  "indexes/projections/materialize": ["Schema Tools", "Projections", "Materialize"],
  "indexes/projections/clear": ["Schema Tools", "Projections", "Clear"],

  "indexes/create": ["Schema Tools", "Index Management"],
  "indexes/create/create": ["Schema Tools", "Index Management", "Create"],
  "indexes/create/materialize": ["Schema Tools", "Index Management", "Materialize"],
  "indexes/create/drop": ["Schema Tools", "Index Management", "Drop"],

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
  "alerting/rules": ["Custom Alerts", "Alert Rules"],
  "rbac/view": ["DB RBAC", "View Grants"],
  "rbac/view/users": ["DB RBAC", "View Grants", "Users"],
  "rbac/view/roles": ["DB RBAC", "View Grants", "Role Grante"],
  "rbac/view/overview": ["DB RBAC", "View Grants", "Full Overview"],

  "rbac/users": ["DB RBAC", "Users"],
  "rbac/users/list": ["DB RBAC", "Users", "List"],
  "rbac/users/create": ["DB RBAC", "Users", "Create"],
  "rbac/users/alter": ["DB RBAC", "Users", "Alter"],
  "rbac/users/grant": ["DB RBAC", "Users", "Grant / Revoke"],
  "rbac/users/drop": ["DB RBAC", "Users", "Drop"],

  "rbac/roles": ["DB RBAC", "Roles"],
  "rbac/roles/list": ["DB RBAC", "Roles", "List"],
  "rbac/roles/create": ["DB RBAC", "Roles", "Create"],
  "rbac/roles/alter": ["DB RBAC", "Roles", "Alter"],
  "rbac/roles/grant": ["DB RBAC", "Roles", "Grant / Revoke"],
  "rbac/roles/drop": ["DB RBAC", "Roles", "Drop"],

  "rbac/profiles": ["DB RBAC", "Settings Profiles"],
  "rbac/profiles/list": ["DB RBAC", "Settings Profiles", "List"],
  "rbac/profiles/create": ["DB RBAC", "Settings Profiles", "Create"],
  "rbac/profiles/alter": ["DB RBAC", "Settings Profiles", "Alter"],
  "rbac/profiles/drop": ["DB RBAC", "Settings Profiles", "Drop"],

  "backups/lifecycle": ["Backups", "Data Lifecycle"],
  "admin/profiles": ["Control Panel", "Storage Profiles"],
  "admin/users": ["Control Panel", "User Management"],
  "admin/cluster": ["Control Panel", "Cluster Management"],
  "admin/app-backup": ["Control Panel", "App Data Backup"],
  "admin/api-management": ["Control Panel", "API Management"],
  "admin/channels": ["Control Panel", "Notification Channels"],
  "admin/trusted-cas": ["Control Panel", "Trusted Certificate Authorities"],
  "admin/app-config": ["Control Panel", "App Config"],
};