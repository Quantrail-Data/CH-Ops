// Select is the themed drop-in for a native <select>. See MultiSelect.stories.jsx
// for the multi-select variant of the same dropdown family (they share
// SelectMenu.jsx under the hood).
import { useState } from "react";
import Select from "./Select.jsx";

export default {
  title: "Existing/Select",
  component: Select,
};

export const Default = {
  render: () => {
    const [value, setValue] = useState("admin");
    return (
      <Select value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 220 }}>
        <option value="readonly">Read only</option>
        <option value="editor">Editor</option>
        <option value="admin">Admin</option>
        <option value="superadmin">Super admin</option>
      </Select>
    );
  },
};

export const WithPlaceholder = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Select value={value} onChange={(e) => setValue(e.target.value)} placeholder="Select a role" style={{ width: 220 }}>
        <option value="readonly">Read only</option>
        <option value="editor">Editor</option>
      </Select>
    );
  },
};

export const Disabled = {
  render: () => (
    <Select value="admin" onChange={() => {}} disabled style={{ width: 220 }}>
      <option value="admin">Admin</option>
    </Select>
  ),
};
