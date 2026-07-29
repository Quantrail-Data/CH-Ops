// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareDialog from "../../src/frontend/components/editor/ShareDialog.jsx";
import { decodeShare, SHARE_PARAM } from "../../src/frontend/utils/shareLink.js";

const linkValue = () => {
  const url = screen.getByLabelText("Share link").value;
  return decodeShare(new URLSearchParams(url.split("#")[1]).get(SHARE_PARAM));
};

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("ShareDialog", () => {
  it("builds a link containing the query", () => {
    render(<ShareDialog sql="SELECT 42" params={{}} onClose={() => {}} />);
    expect(linkValue().sql).toBe("SELECT 42");
  });

  it("does not offer the values option when there are none filled in", () => {
    render(<ShareDialog sql="SELECT 1" params={{ a: "  " }} onClose={() => {}} />);
    expect(screen.queryByText(/parameter value/)).toBeNull();
  });

  it("offers it when values are filled, and leaves it OFF", () => {
    render(<ShareDialog sql="SELECT {a:String}" params={{ a: "acme" }} onClose={() => {}} />);
    const box = screen.getByRole("checkbox");
    expect(box.checked).toBe(false);
    expect(linkValue().params).toBeNull();
  });

  it("includes the values only once ticked", () => {
    render(<ShareDialog sql="SELECT {a:String}" params={{ a: "acme" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(linkValue().params).toEqual({ a: "acme" });
  });

  it("warns that the values travel in the link", () => {
    render(<ShareDialog sql="SELECT {a:String}" params={{ a: "acme" }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/Anyone it reaches can read them/)).toBeTruthy();
  });

  it("ignores blank values when counting", () => {
    render(<ShareDialog sql="SELECT 1" params={{ a: "x", b: "", c: null }} onClose={() => {}} />);
    const label = screen.getByRole("checkbox").closest("label").textContent;
    expect(label).toContain("1 parameter value ");
    expect(label).not.toContain("values");
  });

  it("says the link grants no access", () => {
    // People will assume otherwise, and saying so here is cheaper than
    // explaining it afterwards.
    render(<ShareDialog sql="SELECT 1" params={{}} onClose={() => {}} />);
    expect(screen.getByText(/does not grant access/)).toBeTruthy();
  });

  it("does not imply anything was saved", () => {
    // Sharing unsaved SQL is the main case, not an edge case.
    render(<ShareDialog sql="SELECT 1" params={{}} onClose={() => {}} />);
    expect(screen.queryByText(/saved/i)).toBeNull();
    expect(screen.getByText(/contains a copy of this query/)).toBeTruthy();
  });

  it("warns above the size threshold but still lets you copy", () => {
    // Incompressible on purpose.
    let big = "";
    for (let i = 0; i < 12000; i += 1) big += Math.random().toString(36).slice(2, 8) + " ";
    render(<ShareDialog sql={big} params={{}} onClose={() => {}} />);
    expect(document.body.textContent).toMatch(/will break it/);
    fireEvent.click(screen.getByText(/Copy link/));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("copies", () => {
    render(<ShareDialog sql="SELECT 1" params={{}} onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Copy link/));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("#" + SHARE_PARAM + "="),
    );
  });

  it("survives the clipboard being refused", () => {
    navigator.clipboard.writeText = vi.fn(async () => { throw new Error("denied"); });
    render(<ShareDialog sql="SELECT 1" params={{}} onClose={() => {}} />);
    expect(() => fireEvent.click(screen.getByText(/Copy link/))).not.toThrow();
  });

  it("closes", () => {
    const onClose = vi.fn();
    render(<ShareDialog sql="SELECT 1" params={{}} onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
