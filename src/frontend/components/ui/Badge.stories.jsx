import Badge from "./Badge.jsx";

export default {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Active" },
};

export const Green = { args: { color: "green" } };
export const Red = { args: { color: "red", children: "Failed" } };
export const Amber = { args: { color: "amber", children: "Degraded" } };
export const Blue = { args: { color: "blue", children: "Info" } };
export const Gray = { args: { color: "gray", children: "Idle" } };
export const Purple = { args: { color: "purple", children: "Beta" } };

export const AllColors = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Badge color="green">Green</Badge>
      <Badge color="red">Red</Badge>
      <Badge color="amber">Amber</Badge>
      <Badge color="blue">Blue</Badge>
      <Badge color="gray">Gray</Badge>
      <Badge color="purple">Purple</Badge>
    </div>
  ),
};
