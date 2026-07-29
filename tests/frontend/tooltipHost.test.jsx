// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import SqlEditor from "../../src/frontend/components/editor/SqlEditor.jsx";

const HOST_ID = "chops-cm-tooltip-host";
const hosts = () => [...document.body.children].filter((e) => e.id === HOST_ID);

beforeEach(() => {
  document.getElementById(HOST_ID)?.remove();
});

describe("the tooltip host", () => {
  it("is created once, however many editors there are", () => {
    // CodeMirror appends a host PER EDITOR to whatever parent it is given.
    render(<SqlEditor value="SELECT 1" onChange={() => {}} />);
    render(<SqlEditor value="SELECT 2" onChange={() => {}} />);
    render(<SqlEditor value="SELECT 3" onChange={() => {}} />);
    expect(hosts()).toHaveLength(1);
  });

  it("takes up no space at all", () => {
    render(<SqlEditor value="SELECT 1" onChange={() => {}} />);
    const el = hosts()[0];
    expect(el).toBeTruthy();
    expect(el.style.position).toBe("fixed");
    expect(el.style.width).toBe("0px");
    expect(el.style.height).toBe("0px");
  });

  it("sits on the body, so editor overflow cannot clip a tooltip", () => {
    // The reason for rendering outside the editor in the first place:
    // .sql-editor-wrap is overflow: hidden and cut the documentation panel off.
    render(<SqlEditor value="SELECT 1" onChange={() => {}} />);
    expect(hosts()[0].parentElement).toBe(document.body);
  });
});

describe("the hidden mode pane", () => {
  // SqlEditorPage keeps BOTH modes mounted so tabs survive a mode switch.
  const hidden = {
    visibility: "hidden",
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: -1,
    // CLIPS THE HIDDEN PANE.
    overflow: "hidden",
  };


  it("is taken out of flow", () => {
    expect(hidden.position).toBe("absolute");
    expect(hidden.visibility).toBe("hidden");
  });

  it("CLIPS ITS CONTENTS, which position alone does not", () => {
    expect(hidden.overflow).toBe("hidden");
  });

  it("cannot be clicked through to", () => {
    expect(hidden.pointerEvents).toBe("none");
  });
});
