// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import OpenInMenu from "../../src/frontend/components/queries/OpenInMenu.jsx";

function CurrentLocation() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe("OpenInMenu", () => {
    it("opens a destination and preserves the query id in the route", () => {
        render(
            <MemoryRouter initialEntries={["/overview/queries"]}>
                <OpenInMenu queryId="id/with space" />
                <CurrentLocation />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("button", { name: /Open in\.\.\./i }));
        fireEvent.click(screen.getByRole("button", { name: "Query Metrics" }));

        expect(screen.getByTestId("location")).toHaveTextContent(
            "/tools/metrics?qid=id%2Fwith%20space",
        );
        expect(screen.queryByRole("button", { name: "Query Profiler" })).not.toBeInTheDocument();
    });

    it("closes the destination menu with Escape", () => {
        render(
            <MemoryRouter>
                <OpenInMenu queryId="query-1" />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("button", { name: /Open in\.\.\./i }));
        expect(screen.getByRole("button", { name: "Processors Profile" })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("button", { name: "Processors Profile" })).not.toBeInTheDocument();
    });
});