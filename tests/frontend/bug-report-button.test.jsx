// bug-report-button.test.jsx - Click opens the confirmation, confirm opens
// GitHub. No network and no vi.mock, so it runs under Bun too.
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BugReportButton from
"../../src/frontend/components/layout/BugReportButton.jsx";
const ISSUES_URL = "https://github.com/Quantrail-Data/CH-Ops/issues";
let openedUrls;
let realOpen;
beforeEach(() => {
localStorage.clear();
openedUrls = [];
realOpen = window.open;
window.open = (url) => {
openedUrls.push(url);
return null;
};
// jsdom has no pointer capture. Give the button harmless stand-ins.
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(() => {
window.open = realOpen;
});
function pressAndRelease(button) {
fireEvent.pointerDown(button, { pointerId: 1, clientX: 10, clientY: 10
});
fireEvent.pointerUp(button, { pointerId: 1, clientX: 10, clientY: 10 });
}
describe("BugReportButton", () => {
it("renders the floating button", () => {
render(<BugReportButton />);
expect(screen.getByLabelText("Report a bug")).toBeInTheDocument();
});
it("a click opens the confirmation, cancel closes it and opens nothing",
() => {
render(<BugReportButton />);
pressAndRelease(screen.getByLabelText("Report a bug"));
expect(screen.getByText("Report a bug")).toBeInTheDocument();
fireEvent.click(screen.getByText("Cancel"));
expect(openedUrls).toEqual([]);
});
it("confirm opens the issues page in a new tab", () => {
render(<BugReportButton />);
pressAndRelease(screen.getByLabelText("Report a bug"));
fireEvent.click(screen.getByText("Open GitHub"));
expect(openedUrls).toEqual([ISSUES_URL]);
});
it("a drag moves the button and does not open the confirmation", () => {
render(<BugReportButton />);
const button = screen.getByLabelText("Report a bug");
fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY:
100 });
fireEvent.pointerMove(button, { pointerId: 1, clientX: 160, clientY:
160 });
fireEvent.pointerUp(button, { pointerId: 1, clientX: 160, clientY: 160
});
expect(screen.queryByText("Open GitHub")).toBeNull();
// The moved position is saved.
expect(localStorage.getItem("chops_bug_fab_pos")).not.toBeNull();
});
});