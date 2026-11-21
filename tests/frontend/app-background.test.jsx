// app-background.test.jsx - The particle background: fewer particles on a
// small device, and no animation frames while the window is not in focus.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { isSmallDevice } from "../../src/frontend/components/layout/AppBackground.jsx";
import { Floating3DParticles } from "../../src/frontend/components/ui/floating-3d-particles.jsx";

describe("isSmallDevice", () => {
  it("is true with at most 4 cores or 4 GB of memory", () => {
    expect(isSmallDevice({ hardwareConcurrency: 4, deviceMemory: 16 })).toBe(true);
    expect(isSmallDevice({ hardwareConcurrency: 16, deviceMemory: 4 })).toBe(true);
    expect(isSmallDevice({ hardwareConcurrency: 16, deviceMemory: 16 })).toBe(false);
    // deviceMemory is not in every browser.
    expect(isSmallDevice({ hardwareConcurrency: 8 })).toBe(false);
  });
});

describe("Floating3DParticles loop", () => {
  let frameRequests;
  let pendingFrame;

  beforeEach(() => {
    // jsdom has no canvas drawing: a fake 2D context is enough for the loop.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      new Proxy({}, { get: () => () => {}, set: () => true }),
    );
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    frameRequests = 0;
    pendingFrame = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameRequests += 1;
      pendingFrame = callback;
      return frameRequests;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops asking for frames on window blur and starts again on focus", () => {
    render(<Floating3DParticles quantity={5} maxFps={24} />);
    expect(frameRequests).toBeGreaterThan(0);

    act(() => window.dispatchEvent(new Event("blur")));
    const requestsAtBlur = frameRequests;
    // The waiting frame runs once, sees the pause and asks for no new frame.
    act(() => pendingFrame?.(1000));
    act(() => pendingFrame?.(2000));
    expect(frameRequests).toBe(requestsAtBlur);

    act(() => window.dispatchEvent(new Event("focus")));
    expect(frameRequests).toBe(requestsAtBlur + 1);
  });
});
