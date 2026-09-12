import { useState } from "react";
import { DateTimePicker } from "./DateTimePicker.jsx";

export default {
  title: "Existing/DateTimePicker",
  component: DateTimePicker,
};

export const Default = {
  render: () => {
    const [value, setValue] = useState("2026-09-05 09:30:00");
    return <DateTimePicker value={value} onChange={setValue} />;
  },
};

export const WithLabel = {
  render: () => {
    const [value, setValue] = useState("2026-01-01 00:00:00");
    return <DateTimePicker value={value} onChange={setValue} label="Start of range" name="From" />;
  },
};
