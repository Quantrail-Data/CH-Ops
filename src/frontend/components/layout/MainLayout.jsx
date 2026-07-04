// MainLayout - CHOps dashboard shell (React Router + lazy loading)
// Shell layout: navbar, sidebar, alert marquee, breadcrumb, and content area.
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import Icon from "../common/Icon.jsx";
import React, {
  useState,
  useCallback,
  lazy,
  Suspense,
  useMemo,
  useRef,
} from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import Navbar from "./Navbar.jsx";
import Sidebar from "./Sidebar.jsx";
import GlobalSearch from "./GlobalSearch.jsx";
import { ToastProvider } from "./Toast.jsx";
import AlertMarquee from "./AlertMarquee.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { BREADCRUMB_MAP } from "../../utils/routeMeta.js";

// Core lazy-loaded page components
const ClusterOverview = lazy(() => import("../overview/ClusterOverview.jsx"));
const DailySummary = lazy(() => import("../overview/DailySummary.jsx"));
const QueriesSection = lazy(() => import("../queries/QueriesSection.jsx"));
const TablesAndParts = lazy(() => import("../tables/TablesAndParts.jsx"));
const MergesMutations = lazy(() => import("../merges/MergesMutations.jsx"));
const DistributedDDL = lazy(() => import("../overview/DistributedDDL.jsx"));
const SqlEditorPage = lazy(() => import("../editor/SqlEditorPage.jsx"));
const QueryProfiler = lazy(() => import("../profiler/QueryProfiler.jsx"));
const ProcessorsProfile = lazy(
  () => import("../profiler/ProcessorsProfile.jsx"),
);
const QueryMetrics = lazy(() => import("../profiler/QueryMetrics.jsx"));
const CrashLog = lazy(() => import("../logs/CrashLog.jsx"));
const ErrorLog = lazy(() => import("../logs/ErrorLog.jsx"));
const TextLog = lazy(() => import("../logs/TextLog.jsx"));
const SessionLog = lazy(() => import("../logs/SessionLog.jsx"));
const MonitoringDashboards = lazy(
  () => import("../monitoring/MonitoringDashboards.jsx"),
);
const Playback = lazy(() => import("../monitoring/Playback.jsx"));
const MemoryAllocator = lazy(() => import("../monitoring/MemoryAllocator.jsx"));
const AlertRules = lazy(() => import("../alerting/AlertRules.jsx"));
const AlertChannels = lazy(() => import("../alerting/AlertChannels.jsx"));
const RbacViewGrants = lazy(() => import("../rbac/RbacViewGrants.jsx"));
const RbacUsers = lazy(() => import("../rbac/RbacUsers.jsx"));
const RbacRoles = lazy(() => import("../rbac/RbacRoles.jsx"));
const RbacProfiles = lazy(() => import("../rbac/RbacProfiles.jsx"));
const SchemaVisualizer = lazy(() => import("../schema/SchemaVisualizer.jsx"));
const SecondaryIndexes = lazy(() => import("../indexes/SecondaryIndexes.jsx"));
const Projections = lazy(() => import("../indexes/Projections.jsx"));
const CreateIndex = lazy(() => import("../indexes/CreateIndex.jsx"));
const ChartBuilder = lazy(() => import("../dashboards/ChartBuilder.jsx"));
const DashboardView = lazy(() => import("../dashboards/DashboardView.jsx"));
const AllCharts = lazy(() => import("../dashboards/AllCharts.jsx"));
const DataLifecycle = lazy(() => import("../backups/DataLifecycle.jsx"));
const StorageProfiles = lazy(() => import("../backups/StorageProfiles.jsx"));
const UserManagement = lazy(() => import("../admin/UserManagement.jsx"));
const ClusterManagement = lazy(() => import("../admin/ClusterManagement.jsx"));
const AppDataBackup = lazy(() => import("../admin/AppDataBackup.jsx"));
const ApiManagement = lazy(() => import("../admin/ApiManagement.jsx"));
const QuriozChatComponent = lazy(
  () => import("../qurioz/QuriozChatComponent.jsx"),
);
const QueuesPage = lazy(() => import("../queues/QueuesPage.jsx"));
const SchemaStudio = lazy(() => import("../schema-studio/SchemaStudio.jsx"));

const CORE_ROUTES = [
  ["overview/cluster", ClusterOverview],
  ["overview/summary", DailySummary],
  ["overview/queries/:tab?", QueriesSection],
  ["overview/parts", TablesAndParts],
  ["overview/operations", MergesMutations],
  ["overview/ddl", DistributedDDL],
  ["overview/queues", QueuesPage],
  ["editor/query", SqlEditorPage],
  ["tools/profiler", QueryProfiler],
  ["tools/pipeline", ProcessorsProfile],
  ["tools/metrics", QueryMetrics],
  ["tools/qurioz", QuriozChatComponent],
  ["tools/schema-studio", SchemaStudio],
  ["logs/crash/:tab?", CrashLog],
  ["logs/error/:tab?", ErrorLog],
  ["logs/text/:tab?", TextLog],
  ["logs/session/:tab?", SessionLog],
  ["monitoring/dashboards/:tab?", MonitoringDashboards],
  ["monitoring/playback", Playback],
  ["monitoring/allocator", MemoryAllocator],
  ["alerting/rules", AlertRules],
  ["alerting/channels", AlertChannels],
  ["rbac/view/:tab?", RbacViewGrants],
  ["rbac/users/:tab?", RbacUsers],
  ["rbac/roles/:tab?", RbacRoles],
  ["rbac/profiles/:tab?", RbacProfiles],
  ["indexes/visualizer", SchemaVisualizer],
  ["indexes/secondary", SecondaryIndexes],
  ["indexes/projections/:tab?", Projections],
  ["indexes/create/:tab?", CreateIndex],
  ["custom/dashboards", DashboardView],
  ["backups/lifecycle/:tab?", DataLifecycle],
  ["admin/profiles", StorageProfiles],
  ["admin/users", UserManagement],
  ["admin/cluster", ClusterManagement],
  ["admin/app-backup", AppDataBackup],
  ["admin/api-management", ApiManagement],
  ["/qurioz", QuriozChatComponent],
  
  // ["/qurioz/:session_id?", QuriozChatComponent],
];


function Breadcrumb({ route }) {
  const crumbs = BREADCRUMB_MAP[route];
  if (!crumbs || route.startsWith("editor/")) return null; // hide on SQL editor (no section header)
  return (
    <div
      style={{
        padding: "8px 0px 0",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginBottom: "10px",
      }}
    >
      <Icon className="ti ti-home" style={{ fontSize: 13 }}></Icon>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {i > 0 && (
            <Icon
              className="ti ti-chevron-right"
              style={{ fontSize: 10, opacity: 0.5 }}
            ></Icon>
          )}
          <span
            style={
              i === crumbs.length - 1
                ? { color: "var(--text-secondary)", fontWeight: 500 }
                : {}
            }
          >
            {c}
          </span>
        </span>
      ))}
    </div>
  );
}

function MainLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const route = location.pathname.replace(/^\//, "") || "overview/cluster";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editChart, setEditChart] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const mainRef = useRef();

  const isEditorRoute = route.includes("qurioz");

  const allRoutes = useMemo(() => [...CORE_ROUTES], []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  function handleNavigate(r) {
    navigate("/" + r);
    if (!r.startsWith("editor/")) setSidebarCollapsed(false);
  }

  function ScrollBottomAuto() {
    mainRef?.current?.scrollTo({
      top: document.documentElement.scrollHeight + 9000,
      behavior: "smooth",
    });
    console.log(mainRef?.current);
  }

  const fallback = (
    <div className="empty-state">
      <span className="loading-spinner"></span>
    </div>
  );

  return (
    <ToastProvider>
      <div className="app-shell">
        <Navbar onRefresh={handleRefresh} onOpenSearch={() => setSearchOpen(true)} />
        <AlertMarquee />
        <div className="app-body">
          <Sidebar
            currentRoute={route}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            forceCollapsed={false}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />
          <main className="app-main" ref={mainRef}>
            <Breadcrumb route={route} />
            <ErrorBoundary>
              <Suspense fallback={fallback}>
                <Routes>
                  {allRoutes.map(([path, Comp]) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <Comp
                          key={refreshKey}
                          sidebar={sidebarCollapsed}
                          ScrollBottomAuto={ScrollBottomAuto}
                        />
                      }
                    />
                  ))}
                  <Route
                    path="custom/builder"
                    element={
                      <ChartBuilder
                        key={refreshKey}
                        editChart={editChart}
                        onEditDone={() => {
                          setEditChart(null);
                          setRefreshKey((k) => k + 1);
                        }}
                      />
                    }
                  />
                  <Route
                    path="custom/charts"
                    element={
                      <AllCharts
                        key={refreshKey}
                        onEdit={(chart) => {
                          setEditChart(chart);
                          navigate("/custom/builder");
                        }}
                      />
                    }
                  />
                  <Route
                    path="/"
                    element={<Navigate to="/overview/cluster" replace />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/overview/cluster" replace />}
                  />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <div
          className="copyright-footer"
          style={{ paddingLeft: route === "/qurioz" && "15%" }}
        >
          Copyright &copy; 2026 Quantrail™ Data Private Limited. All rights
          reserved.
        </div>
        <GlobalSearch
          open={searchOpen}
          onOpen={() => setSearchOpen(true)}
          onClose={() => setSearchOpen(false)}
          onNavigate={handleNavigate}
        />
      </div>
    </ToastProvider>
  );
}

export default function MainLayout() {
  return (
    <HashRouter>
      <MainLayoutInner />
    </HashRouter>
  );
}