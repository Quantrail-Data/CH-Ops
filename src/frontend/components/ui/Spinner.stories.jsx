import Spinner from "./Spinner.jsx";

export default {
  title: "UI/Spinner",
  component: Spinner,
};

export const Small = { args: { size: "sm" } };
export const Medium = { args: { size: "md" } };
export const Large = { args: { size: "lg" } };

export const AllSizes = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};
