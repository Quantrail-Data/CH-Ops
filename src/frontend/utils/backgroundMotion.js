// backgroundMotion.js - The user's choice for the animated page background
// (the floating particles). It is on by default and saved in localStorage.
// The navbar user menu changes it; the page background reads it.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "chops_background_motion";
const CHANGE_EVENT = "chops:background-motion";

export function isBackgroundMotionOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setBackgroundMotion(isOn) {
  try {
    localStorage.setItem(STORAGE_KEY, isOn ? "on" : "off");
  } catch {
    // Blocked storage only loses the choice on reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// React hook: true while the background animation is on.
export function useBackgroundMotion() {
  return useSyncExternalStore(subscribe, isBackgroundMotionOn, () => true);
}
