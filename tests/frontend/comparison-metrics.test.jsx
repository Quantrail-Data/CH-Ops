// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ComparisonMetrics from "../../src/frontend/components/editor/ComparisonMetrics.jsx";

describe("ComparisonMetrics", () => {
    it("marks the lower estimate as better for each metric", () => {
        render(
            <ComparisonMetrics
                mode="estimate"
                left={{ ok: true, metrics: { rows: 500, parts: 3, marks: 8, tables: 1 } }}
                right={{ ok: true, metrics: { rows: 1000, parts: 3, marks: 12, tables: 2 } }}
            />,
        );

        const rows = screen.getByText("Estimated rows read").closest("tr");
        const cells = within(rows).getAllByRole("cell");
        expect(cells[1]).toHaveClass("cmp-better");
        expect(cells[1]).toHaveTextContent("better");
        expect(cells[2]).toHaveTextContent("100% higher");

        const tied = screen.getByText("Parts touched").closest("tr");
        expect(within(tied).getAllByRole("cell")[1]).not.toHaveClass("cmp-better");
        expect(within(tied).getAllByRole("cell")[2]).not.toHaveClass("cmp-better");
    });

    it("shows execution metrics and side-specific errors", () => {
        render(
            <ComparisonMetrics
                mode="execute"
                left={{ ok: false, error: "left query failed" }}
                right={{
                    ok: true,
                    metrics: {
                        resultRows: 5,
                        readRows: 100,
                        readBytes: 1024,
                        elapsedMs: 250,
                        memoryBytes: 2048,
                        writtenRows: 0,
                    },
                }}
            />,
        );

        expect(screen.getByText("Duration")).toBeInTheDocument();
        expect(screen.getByText("Left: left query failed")).toBeInTheDocument();
        expect(screen.getByText("250.0 ms")).toBeInTheDocument();
        expect(screen.getByText(/Lower is better for every metric/)).toBeInTheDocument();
    });
});