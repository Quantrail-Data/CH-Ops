// useIdleTimeout.js - Sliding inactivity logout
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { useEffect, useRef } from "react";

export const DEFAULT_IDLE_MINUTES = 15;


export const IDLE_ACTIVITY_KEY = "chops_last_activity";


const CHECK_INTERVAL_MS = 15 * 1000;


const WRITE_THROTTLE_MS = 1000;


let busyCount = 0;

export function beginBusy() {
  busyCount += 1;
}

export function endBusy() {
  busyCount = Math.max(0, busyCount - 1);
}

export function isBusy() {
  return busyCount > 0;
}


const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll", "click",
];


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
    
  }
}


export default function useIdleTimeout({ enabled, onIdle, idleMinutes = DEFAULT_IDLE_MINUTES }) {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return undefined;

    const idleMs = Math.max(1, Number(idleMinutes) || DEFAULT_IDLE_MINUTES) * 60 * 1000;
    let fired = false; 
    let lastWrite = 0; 
    let localActivity = Date.now();

   
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
      if (isBusy()) return;
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
