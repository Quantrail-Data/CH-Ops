import { useState } from "react";
import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

export default {
  title: "UI/Modal",
  component: Modal,
};

function OpenModalDemo(modalProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal {...modalProps} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export const Default = {
  render: () => (
    <OpenModalDemo
      title="Delete cluster"
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Delete</Button>
        </>
      }
    >
      <p>This removes the cluster configuration. Nodes are not affected.</p>
    </OpenModalDemo>
  ),
};

export const Sizes = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      {["sm", "md", "lg", "xl"].map((size) => (
        <OpenModalDemo key={size} title={`Size: ${size}`} size={size}>
          <p>maxWidth is set from the size prop.</p>
        </OpenModalDemo>
      ))}
    </div>
  ),
};

export const WithoutFooter = {
  render: () => (
    <OpenModalDemo title="Just an informational dialog">
      <p>Modal renders fine with no footer at all.</p>
    </OpenModalDemo>
  ),
};

export const CustomStyleOverride = {
  render: () => (
    <OpenModalDemo style={{ maxWidth: 880, width: "94%", maxHeight: "84vh", padding: 0 }}>
      <div style={{ padding: 20 }}>
        <p>
          For a box that needs sizing beyond the four presets - a wide grid,
          a fixed height with internal scrolling - pass a `style` override.
          It merges over (and can replace) the size preset's maxWidth.
        </p>
      </div>
    </OpenModalDemo>
  ),
};
