// modal.test.jsx - components/ui/Modal.jsx
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Modal from "../../src/frontend/components/ui/Modal.jsx";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Modal open={false} title="Hidden" onClose={() => {}}>
        body
      </Modal>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the title, children, and footer", () => {
    render(
      <Modal open title="Delete User" onClose={() => {}} footer={<button>Confirm</button>}>
        Delete this user?
      </Modal>,
    );
    expect(screen.getByText("Delete User")).toBeInTheDocument();
    expect(screen.getByText("Delete this user?")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const fn = vi.fn();
    render(
      <Modal open title="t" onClose={fn}>
        body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on overlay click but not on box click", () => {
    const fn = vi.fn();
    const { container } = render(
      <Modal open title="t" onClose={fn}>
        body
      </Modal>,
    );
    fireEvent.click(container.querySelector(".modal-box"));
    expect(fn).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".modal-overlay"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not close on overlay click when closeOnOverlayClick is false", () => {
    const fn = vi.fn();
    const { container } = render(
      <Modal open title="t" onClose={fn} closeOnOverlayClick={false}>
        body
      </Modal>,
    );
    fireEvent.click(container.querySelector(".modal-overlay"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps size to the box max-width", () => {
    const { container } = render(
      <Modal open title="t" onClose={() => {}} size="lg">
        body
      </Modal>,
    );
    expect(container.querySelector(".modal-box").style.maxWidth).toBe("720px");
  });

  it("merges a custom style over the size's max-width", () => {
    const { container } = render(
      <Modal open onClose={() => {}} style={{ maxWidth: 880, padding: 0 }}>
        body
      </Modal>,
    );
    const box = container.querySelector(".modal-box");
    expect(box.style.maxWidth).toBe("880px");
    expect(box.style.padding).toBe("0px");
  });

  it("forwards extra props like aria-label to the box", () => {
    const { container } = render(
      <Modal open onClose={() => {}} aria-label="Filter settings">
        body
      </Modal>,
    );
    expect(container.querySelector(".modal-box")).toHaveAttribute("aria-label", "Filter settings");
  });
});
