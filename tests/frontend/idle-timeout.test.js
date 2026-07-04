// idle-timeout.test.js - Sliding inactivity logout.
//
// Covers the pure idle predicate, the hook's timer behaviour (no early fire,
// fires after the window, resets on activity, respects enabled, cleans up), and
// that App wires it to logout with the 15-minute default.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { renderHook } from "@testing-library/react";
import useIdleTimeout, {
  isIdle, DEFAULT_IDLE_MINUTES, IDLE_ACTIVITY_KEY,
} from "../../src/frontend/hooks/useIdleTimeout.js";

const MIN = 60 * 1000;

describe("isIdle predicate", () => {
  it("is not idle before the window elapses", () => {
    expect(isIdle(1000, 1000 + 14 * MIN, 15 * MIN)).toBe(false);
  });
  it("is idle once the window elapses", () => {
    expect(isIdle(1000, 1000 + 15 * MIN, 15 * MIN)).toBe(true);
    expect(isIdle(1000, 1000 + 20 * MIN, 15 * MIN)).toBe(true);
  });
  it("treats unknown activity as active (fail safe, no auto-logout)", () => {
    expect(isIdle(0, 999999, 15 * MIN)).toBe(false);
    expect(isIdle(null, 999999, 15 * MIN)).toBe(false);
  });
});

describe("useIdleTimeout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to a 15-minute window", () => {
    expect(DEFAULT_IDLE_MINUTES).toBe(15);
  });

  it("does not log out before the window, then logs out once after it", () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: true, onIdle, idleMinutes: 15 }),
    );

    vi.advanceTimersByTime(14 * MIN);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * MIN); // 16 min total, past the deadline
    expect(onIdle).toHaveBeenCalledTimes(1);

    // stays fired-once even if more idle time passes
    vi.advanceTimersByTime(30 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("resets the window on user activity (sliding)", () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: true, onIdle, idleMinutes: 15 }),
    );

    vi.advanceTimersByTime(14 * MIN);
    window.dispatchEvent(new Event("mousedown")); // activity resets the clock
    vi.advanceTimersByTime(14 * MIN); // 14 min since the reset, still under 15
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * MIN); // now 16 min since the reset
    expect(onIdle).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("writes shared activity to localStorage so other tabs stay alive", () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: true, onIdle, idleMinutes: 15 }),
    );
    window.dispatchEvent(new Event("keydown"));
    expect(Number(localStorage.getItem(IDLE_ACTIVITY_KEY))).toBeGreaterThan(0);
    unmount();
  });

  it("does nothing when disabled", () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: false, onIdle, idleMinutes: 15 }),
    );
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    unmount();
  });

  it("stops firing after unmount (listeners + interval cleaned up)", () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleTimeout({ enabled: true, onIdle, idleMinutes: 15 }),
    );
    unmount();
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe("App wiring", () => {
  const code = fs.readFileSync("src/frontend/App.jsx", "utf8");
  it("arms the idle timeout only while authenticated, calling logout", () => {
    expect(code).toContain('import useIdleTimeout from "./hooks/useIdleTimeout.js"');
    expect(code).toContain("useIdleTimeout({ enabled: !!auth, onIdle: logout })");
  });
});
