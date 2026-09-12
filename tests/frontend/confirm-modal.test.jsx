// confirm-modal.test.jsx - components/layout/ConfirmModal.jsx
//
// Regression coverage for the refactor onto ui/Modal + ui/Button: same props,
// same focus/danger/cancel/confirm behavior as before the extraction.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConfirmModal from "../../src/frontend/components/layout/ConfirmModal.jsx";

describe("ConfirmModal", () => {
  it("renders the title and message", () => {
    render(
      <ConfirmModal title="Delete User" message="Delete this user?" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText("Delete User")).toBeInTheDocument();
    expect(screen.getByText("Delete this user?")).toBeInTheDocument();
  });

  it("uses btn-primary for the confirm button by default, btn-danger when danger", () => {
    const { container, rerender } = render(
      <ConfirmModal title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelector("button.btn-primary")).toBeTruthy();

    rerender(<ConfirmModal title="t" message="m" onConfirm={() => {}} onCancel={() => {}} danger />);
    expect(container.querySelector("button.btn-danger")).toBeTruthy();
  });

  it("focuses the confirm button on mount", () => {
    render(<ConfirmModal title="t" message="m" onConfirm={() => {}} onCancel={() => {}} confirmText="Confirm" />);
    expect(screen.getByText("Confirm")).toHaveFocus();
  });

  it("calls onCancel when Cancel is clicked and on Escape", () => {
    const fn = vi.fn();
    render(<ConfirmModal title="t" message="m" onConfirm={() => {}} onCancel={fn} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(fn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const fn = vi.fn();
    render(<ConfirmModal title="t" message="m" onConfirm={fn} onCancel={() => {}} confirmText="Delete" />);
    fireEvent.click(screen.getByText("Delete"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button when confirmDisabled is set", () => {
    render(
      <ConfirmModal
        title="t"
        message="m"
        onConfirm={() => {}}
        onCancel={() => {}}
        confirmText="Confirm"
        confirmDisabled
      />,
    );
    expect(screen.getByText("Confirm")).toBeDisabled();
  });
});
