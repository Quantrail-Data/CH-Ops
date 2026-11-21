// The pages that the visual check opens.
//
// route: the part after "#/" in the address.
// tabs:  true to also open each tab of the page (see TAB_SELECTOR in lib/settings.js).
// steps: extra states to open, for example a dialog. Each step has a name and
//        an action. The action gets the Playwright page.

// Clicks the first visible button with this text.
function clickButton(text) {
  return async (page) => page.getByRole("button", { name: text, exact: false }).first().click();
}

export const PAGES = [
  {
    name: "home",
    route: "home",
    steps: [
      { name: "user-menu", action: async (page) => page.click(".navbar-user-btn") },
      {
        name: "search",
        action: async (page) => {
          await page.keyboard.press("Escape");
          // Let the user menu finish closing first.
          await page.waitForTimeout(300);
          await page.keyboard.press("Control+k");
        },
      },
    ],
  },
  { name: "cluster-overview", route: "overview/cluster", tabs: true },
  { name: "daily-summary", route: "overview/summary", tabs: true },
  { name: "queries", route: "overview/queries", tabs: true },
  { name: "tables-and-parts", route: "overview/parts", tabs: true },
  { name: "merges-and-mutations", route: "overview/operations", tabs: true },
  { name: "ddl-and-readonly", route: "overview/ddl", tabs: true },
  { name: "queues", route: "overview/queues", tabs: true },
  { name: "kubernetes-insights", route: "overview/kubernetes", tabs: true },
  { name: "sql-editor", route: "editor/query" },
  { name: "query-profiler", route: "tools/profiler", tabs: true },
  { name: "processors-profile", route: "tools/pipeline", tabs: true },
  { name: "query-metrics", route: "tools/metrics", tabs: true },
  { name: "schema-studio", route: "tools/schema-studio", tabs: true },
  { name: "qurioz", route: "tools/qurioz" },
  { name: "crash-log", route: "logs/crash", tabs: true },
  { name: "error-log", route: "logs/error", tabs: true },
  { name: "text-log", route: "logs/text", tabs: true },
  { name: "session-log", route: "logs/session", tabs: true },
  { name: "system-dashboards", route: "monitoring/dashboards", tabs: true },
  { name: "playback", route: "monitoring/playback" },
  { name: "memory-allocator", route: "monitoring/allocator", tabs: true },
  { name: "alert-rules", route: "alerting/rules", steps: [{ name: "new rule", action: clickButton("New Rule") }] },
  { name: "rbac-view-grants", route: "rbac/view", tabs: true },
  { name: "rbac-users", route: "rbac/users", tabs: true },
  { name: "rbac-roles", route: "rbac/roles", tabs: true },
  { name: "rbac-profiles", route: "rbac/profiles", tabs: true },
  { name: "schema-visualizer", route: "indexes/visualizer" },
  { name: "data-skipping-indexes", route: "indexes/secondary", tabs: true },
  { name: "projections", route: "indexes/projections", tabs: true },
  { name: "index-management", route: "indexes/create", tabs: true },
  { name: "dashboards", route: "custom/dashboards", tabs: true },
  { name: "data-lifecycle", route: "backups/lifecycle", tabs: true },
  { name: "storage-profiles", route: "admin/profiles" },
  { name: "user-management", route: "admin/users", steps: [{ name: "new user", action: clickButton("New User") }] },
  {
    name: "cluster-management",
    route: "admin/cluster",
    tabs: true,
    steps: [{ name: "new cluster", action: clickButton("New Cluster") }],
  },
  { name: "app-data-backup", route: "admin/app-backup" },
  { name: "api-management", route: "admin/api-management" },
  { name: "notification-channels", route: "admin/channels" },
  { name: "trusted-cas", route: "admin/trusted-cas" },
  { name: "app-config", route: "admin/app-config", tabs: true },
];
