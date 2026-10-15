// BugReportButton.jsx - Floating button that opens the GitHub issues page.
// The user can drag it anywhere. The position is saved in localStorage.
// Copyright (C) 2026 Quantrail Data Private Limited
import React, { useEffect, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
const ISSUES_URL = "https://github.com/Quantrail-Data/CH-Ops/issues";
const STORAGE_KEY = "chops_bug_fab_pos";
const BUTTON_SIZE = 52;
const EDGE_GAP = 8;
// A press that moves less than this many pixels counts as a click.
const CLICK_LIMIT_PX = 6;
// Keep the button fully inside the window.
function clampToViewport(x, y) {
const maxX = window.innerWidth - BUTTON_SIZE - EDGE_GAP;
const maxY = window.innerHeight - BUTTON_SIZE - EDGE_GAP;
return {
x: Math.min(Math.max(x, EDGE_GAP), maxX),
y: Math.min(Math.max(y, EDGE_GAP), maxY),
};
}
// Saved position, or null for the default spot. Never throws.
function loadSavedPosition() {
try {
const raw = localStorage.getItem(STORAGE_KEY);
if (!raw) return null;
const parsed = JSON.parse(raw);
if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number")
return null;
return clampToViewport(parsed.x, parsed.y);
} catch {
return null;
}
}
function savePosition(pos) {
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
} catch {
// Blocked storage only loses the position on reload.
}
}
export default function BugReportButton() {
// null means the default spot above the search button, set by the CSS.
const [position, setPosition] = useState(loadSavedPosition);
const [confirmOpen, setConfirmOpen] = useState(false);
const dragRef = useRef(null);
// Pull the button back into view when the window shrinks.
useEffect(() => {
function onResize() {
setPosition((pos) => (pos ? clampToViewport(pos.x, pos.y) : pos));
}
window.addEventListener("resize", onResize);
return () => window.removeEventListener("resize", onResize);
}, []);
function onPointerDown(e) {
const rect = e.currentTarget.getBoundingClientRect();
dragRef.current = {
startX: e.clientX,
startY: e.clientY,
// Where the pointer sits inside the button, so the button does not jump.
offsetX: e.clientX - rect.left,
offsetY: e.clientY - rect.top,
moved: false,
};
e.currentTarget.setPointerCapture(e.pointerId);
}
function onPointerMove(e) {
const drag = dragRef.current;
if (!drag) return;
const movedX = Math.abs(e.clientX - drag.startX);
const movedY = Math.abs(e.clientY - drag.startY);
if (!drag.moved && movedX < CLICK_LIMIT_PX && movedY < CLICK_LIMIT_PX)
return;
drag.moved = true;
const next = clampToViewport(e.clientX - drag.offsetX, e.clientY -
drag.offsetY);
setPosition(next);
savePosition(next);
}
function onPointerUp(e) {
const drag = dragRef.current;
dragRef.current = null;
if (!drag) return;
e.currentTarget.releasePointerCapture(e.pointerId);
// A press without movement is a click: ask for confirmation.
if (!drag.moved) setConfirmOpen(true);
}
const dragStyle = position
? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
: undefined;
return (
<>
<button
type="button"
className="bug-report-fab"
style={dragStyle}
title="Report a bug on GitHub"
aria-label="Report a bug"
onPointerDown={onPointerDown}
onPointerMove={onPointerMove}
onPointerUp={onPointerUp}
>
<Icon className="ti ti-bug" />
</button>
{confirmOpen && (
<ConfirmModal
title="Report a bug"
message="We appreciate you taking a moment to do this. Bug
reports like yours are how CHOps gets better for the whole community.
Continue to our GitHub issues page?"
confirmText="Open GitHub"
onConfirm={() => {
setConfirmOpen(false);
window.open(ISSUES_URL, "_blank", "noopener,noreferrer");
}}
onCancel={() => setConfirmOpen(false)}
/>
)}
</>
);
}