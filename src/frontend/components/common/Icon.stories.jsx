import Icon from "./Icon.jsx";

export default {
  title: "Existing/Icon",
  component: Icon,
};

export const Basic = { args: { name: "database" } };
export const Filled = { args: { name: "settings-filled" } };
export const WithTitle = { args: { name: "alert-triangle", title: "Warning" } };
export const CustomSize = { args: { name: "users", style: { fontSize: 32 } } };

export const AGridOfCommonIcons = {
  render: () => (
    <div style={{ display: "flex", gap: 16, fontSize: 22 }}>
      {["database", "users", "shield", "settings", "trash", "key", "plus", "x"].map((name) => (
        <Icon key={name} name={name} />
      ))}
    </div>
  ),
};
