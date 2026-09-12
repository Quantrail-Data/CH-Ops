import { useState } from "react";
import MultiSelect from "./MultiSelect.jsx";

export default {
  title: "Existing/MultiSelect",
  component: MultiSelect,
};

const options = ["node1", "node2", "node3", "node4"];

export const Default = {
  render: () => {
    const [value, setValue] = useState(["node1", "node3"]);
    return <MultiSelect options={options} value={value} onChange={setValue} style={{ width: 260 }} />;
  },
};

export const ObjectOptions = {
  render: () => {
    const [value, setValue] = useState(["editor"]);
    return (
      <MultiSelect
        options={[
          { value: "readonly", label: "Read only" },
          { value: "editor", label: "Editor" },
          { value: "admin", label: "Admin" },
        ]}
        value={value}
        onChange={setValue}
        style={{ width: 260 }}
      />
    );
  },
};

export const Empty = {
  render: () => <MultiSelect options={options} value={[]} onChange={() => {}} style={{ width: 260 }} />,
};
