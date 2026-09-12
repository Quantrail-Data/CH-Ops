import { useState } from "react";
import Tabs from "./Tabs.jsx";

const items = [
  { key: "users", label: "Users", icon: "users" },
  { key: "roles", label: "Roles", icon: "shield" },
  { key: "profiles", label: "Profiles", icon: "settings" },
];

export default {
  title: "UI/Tabs",
  component: Tabs,
};

export const Default = {
  render: () => {
    const [active, setActive] = useState("users");
    return <Tabs items={items} active={active} onChange={setActive} />;
  },
};

export const WithoutIcons = {
  render: () => {
    const [active, setActive] = useState("users");
    return (
      <Tabs
        items={items.map(({ key, label }) => ({ key, label }))}
        active={active}
        onChange={setActive}
      />
    );
  },
};
