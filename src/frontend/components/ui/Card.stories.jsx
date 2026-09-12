import Card from "./Card.jsx";

export default {
  title: "UI/Card",
  component: Card,
};

export const Default = {
  args: {
    style: { padding: 20, maxWidth: 320 },
    children: (
      <>
        <h3 style={{ marginBottom: 8 }}>Cluster health</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          All nodes reporting normally.
        </p>
      </>
    ),
  },
};

export const AsSection = {
  args: {
    as: "section",
    style: { padding: 20, maxWidth: 320 },
    children: "Rendered as a <section> instead of a <div>.",
  },
};
