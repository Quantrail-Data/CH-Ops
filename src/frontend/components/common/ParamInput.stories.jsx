// One input for one {name:Type} ClickHouse® query parameter - the input kind
// (text, number, date, or a Select for enums) is derived from `param.type`.
import { useState } from "react";
import ParamInput from "./ParamInput.jsx";

export default {
  title: "Existing/ParamInput",
  component: ParamInput,
};

export const StringParam = {
  render: () => {
    const [value, setValue] = useState("");
    return <ParamInput param={{ name: "table_name", type: "String" }} value={value} onChange={setValue} />;
  },
};

export const NumericParam = {
  render: () => {
    const [value, setValue] = useState("100");
    return <ParamInput param={{ name: "limit", type: "UInt32" }} value={value} onChange={setValue} />;
  },
};

export const Invalid = {
  render: () => {
    const [value, setValue] = useState("");
    return <ParamInput param={{ name: "database", type: "String" }} value={value} onChange={setValue} invalid />;
  },
};
