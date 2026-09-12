// DataTable is the app's generic, prop-configurable table (virtualized above
// ~100 rows via @tanstack/react-virtual). SortableDataTable.jsx is a
// near-duplicate, out-of-scope implementation - prefer DataTable for new code.
import DataTable from "./DataTable.jsx";
import Button from "../ui/Button.jsx";

export default {
  title: "Existing/DataTable",
  component: DataTable,
};

const columns = ["username", "role", "email", "lastLoginAt"];
const rows = [
  { username: "admin", role: "superadmin", email: "admin@example.com", lastLoginAt: "2026-09-04 10:12" },
  { username: "kathir", role: "editor", email: "kathir@example.com", lastLoginAt: "2026-09-03 08:45" },
  { username: "praveen", role: "readonly", email: "praveen@example.com", lastLoginAt: "2026-09-01 16:20" },
];

export const Default = {
  args: { columns, rows },
};

export const Empty = {
  args: { columns, rows: [], emptyMessage: "No users yet." },
};

export const WithActions = {
  args: {
    columns,
    rows,
    actions: (row) => (
      <Button variant="danger" size="sm" title="Delete">
        Delete
      </Button>
    ),
  },
};
