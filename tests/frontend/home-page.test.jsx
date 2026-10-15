// home-page.test.jsx - The Home page shows each role only the cards it can use.
// Copyright (C) 2026 Quantrail Data Private Limited
import React from "react";
import fs from "fs";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../src/frontend/App.jsx";
import HomePage, {
HOME_CARDS,
getVisibleCards,
} from "../../src/frontend/components/home/HomePage.jsx";
const layout = fs.readFileSync(
"src/frontend/components/layout/MainLayout.jsx",
"utf8",
);
// Pages that show only an "administrators only" message to readonly and editor users.
const ADMIN_ONLY_PAGES = ["overview/kubernetes", "backups/lifecycle"];
function visiblePages(role) {
return getVisibleCards(role).map((card) => card.page);
}
function renderHomeAs(role) {
const authValue = { auth: { role }, login: () => {}, logout: () => {} };
return render(
<AuthContext.Provider value={authValue}>
<MemoryRouter>
<HomePage />
</MemoryRouter>
</AuthContext.Provider>,
);
}
afterEach(() => cleanup());
describe("Home page: cards per role", () => {
for (const role of ["readonly", "editor"]) {
it(`${role} does not see admin-only cards`, () => {
const pages = visiblePages(role);
expect(pages).not.toContain("admin/users");
expect(pages).not.toContain("backups/lifecycle");
expect(pages).not.toContain("overview/kubernetes");
expect(pages).toContain("tools/qurioz");
expect(pages).toContain("tools/schema-studio");
expect(pages).toContain("rbac/view");
});
}
for (const role of ["admin", "superadmin"]) {
it(`${role} sees every card`, () => {
expect(getVisibleCards(role)).toEqual(HOME_CARDS);
});
}
it("an unknown or missing role is treated as readonly", () => {
expect(visiblePages("unknown")).toEqual(visiblePages("readonly"));
expect(visiblePages(undefined)).toEqual(visiblePages("readonly"));
});
});
describe("Home page: cards stay correct", () => {
it("every admin-only page has minRole admin", () => {
for (const card of HOME_CARDS) {
const isAdminPage =
card.page.startsWith("admin/") ||
ADMIN_ONLY_PAGES.includes(card.page);
if (isAdminPage) expect(card.minRole).toBe("admin");
}
});
it("every card opens a real route", () => {
for (const card of HOME_CARDS) {
const isRouted =
layout.includes(`["${card.page}",`) ||
layout.includes(`["${card.page}/:tab?",`);
expect(isRouted).toBe(true);
}
});
it("every card has a title, a description and an icon", () => {
for (const card of HOME_CARDS) {
expect(card.title).toBeTruthy();
expect(card.description).toBeTruthy();
expect(card.icon).toMatch(/^ti-/);
}
});
});
describe("Home page: rendering", () => {
it("readonly user gets working card links and no admin cards", () => {
renderHomeAs("readonly");
const quriozCard = screen.getByRole("link", {
name: /Ask in plain English/,
});
expect(quriozCard.getAttribute("href")).toBe("/tools/qurioz");
expect(screen.queryByRole("link", { name: /Manage CHOps/
})).toBeNull();
});
it("admin sees the Manage CHOps card", () => {
renderHomeAs("admin");
const adminCard = screen.getByRole("link", { name: /Manage CHOps/ });
expect(adminCard.getAttribute("href")).toBe("/admin/users");
});
});
describe("Home page: routing", () => {
it("has a /home route", () => {
expect(layout).toContain('["home", HomePage]');
});
it("sends the root path and unknown paths to /home", () => {
expect(layout).toContain('<Navigate to="/home" replace />');
expect(layout).not.toContain('<Navigate to="/overview/cluster" replace />');
});
});