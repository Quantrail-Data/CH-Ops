// useIdleTimeout.js - Sliding inactivity logout
//
// Logs the user out after a stretch with no user interaction. The window is
// "sliding": any activity (mouse, keyboard, touch, scroll, wheel) resets it.
// This is a client-side convenience on top of the server's absolute 2-hour token
// expiry; it does not replace that hard cap.
//
// Activity is recorded to localStorage so interaction in ANY open tab keeps every
// tab alive (they share one token). A purely per-tab timer would let an idle
// background tab log out a tab the user is actively working in, so the idle clock
// is shared and logout only fires once every tab has gone quiet.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { useEffect, useRef } from "react";

export const DEFAULT_IDLE_MINUTES = 15;

// Shared across tabs so activity anywhere resets the idle clock everywhere.
export const IDLE_ACTIVITY_KEY = "chops_last_activity";

// How often the idle condition is checked. Small relative to the timeout, so
// logout lands within this window of the deadline without busy-waiting.
const CHECK_INTERVAL_MS = 15 * 1000;

// High-frequency events (mousemove) write to localStorage at most once per this
// window; the in-memory timestamp is always current for the local tab.
const WRITE_THROTTLE_MS = 1000;

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll", "click",
];

// Pure predicate (exported for tests): has the idle deadline passed?
// An unknown last-activity is treated as active (fail safe: never auto-logout on
// missing data).
export function isIdle(lastActivityMs, nowMs, idleMs) {
  if (!lastActivityMs) return false;
  return nowMs - lastActivityMs >= idleMs;
}

function readLastActivity() {
  try {
    const v = Number(localStorage.getItem(IDLE_ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writeLastActivity(ts) {
  try {
    localStorage.setItem(IDLE_ACTIVITY_KEY, String(ts));
  } catch {
    /* storage unavailable; the local in-memory timestamp still works */
  }
}

// enabled:    only arm the timer while authenticated
// onIdle:     called once when the idle deadline passes (e.g. logout)
// idleMinutes: sliding window length, defaults to 15
export default function useIdleTimeout({ enabled, onIdle, idleMinutes = DEFAULT_IDLE_MINUTES }) {
  // Hold onIdle in a ref so its identity changing each render does not tear down
  // and reattach every listener.
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return undefined;

    const idleMs = Math.max(1, Number(idleMinutes) || DEFAULT_IDLE_MINUTES) * 60 * 1000;
    let fired = false; // only log out once per armed period
    let lastWrite = 0; // throttle guard for storage writes
    let localActivity = Date.now(); // this tab's own most-recent activity (instant)

    // A freshly loaded, untouched tab counts as active at load time.
    writeLastActivity(localActivity);

    const markActivity = () => {
      const now = Date.now();
      localActivity = now;
      if (now - lastWrite >= WRITE_THROTTLE_MS) {
        lastWrite = now;
        writeLastActivity(now);
      }
    };

    const check = () => {
      if (fired) return;
      // Most recent activity across this tab (instant) and any other tab (shared).
      const last = Math.max(localActivity, readLastActivity());
      if (isIdle(last, Date.now(), idleMs)) {
        fired = true;
        onIdleRef.current?.();
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActivity));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [enabled, idleMinutes]);
}
