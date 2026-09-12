import { SqlPreview, StatCard } from "./SharedComponents.jsx";

export default {
  title: "Existing/SharedComponents",
};

export const StatCardBasic = {
  render: () => <StatCard label="Uptime" value="99.98%" />,
};

export const StatCardWithIcon = {
  render: () => <StatCard icon="ti-database" label="Databases" value="12" color="var(--accent)" />,
};

export const StatCardEmpty = {
  render: () => <StatCard label="Memory" />,
};

export const SqlPreviewBasic = {
  render: () => <SqlPreview sql={"SELECT database, count() AS tables\nFROM system.tables\nGROUP BY database"} />,
};
