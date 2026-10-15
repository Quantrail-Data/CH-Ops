// advancedFilters.test.js - Pure-logic tests, no network, no mocks.
import { describe, it, expect, beforeEach } from "vitest";
import {
    MAX_FILTERS,
    normalizeFilters,
    activeFilters,
    buildWhere,
    extraColumns,
    extraSelectSql,
    loadAdvState,
    saveAdvState,
} from "../../src/frontend/utils/advancedFilters.js";
describe("normalizeFilters", () => {
    it("fixes shape and defaults op to AND", () => {
        expect(normalizeFilters([{ expr: "a=1" }, { op: "OR", expr: "b=2" }])).toEqual([{ op: "AND", expr: "a=1" },
        { op: "OR", expr: "b=2" },
        ]);
    });
    it("caps at MAX_FILTERS", () => {
        const many = Array.from({ length: 15 }, () => ({ expr: "x" }));
        expect(normalizeFilters(many)).toHaveLength(MAX_FILTERS);
    });
    it("tolerates garbage", () => {
        expect(normalizeFilters(null)).toEqual([]);
        expect(normalizeFilters([null, 42, { op: "NOR", expr: 7 }])).toEqual([
            { op: "AND", expr: "" },
            { op: "AND", expr: "" },
            { op: "AND", expr: "" },
        ]);
    });
});
describe("buildWhere", () => {
    const base = ["event_time BETWEEN '2026-01-01' AND '2026-01-02'", "level IN('Error')"];
it("returns base unchanged with no filters", () => {
        expect(buildWhere(base, [])).toBe(base.join(" AND "));
    });
    it("skips blank fragments", () => {
        expect(buildWhere(base, [{ op: "AND", expr: " " }])).toBe(base.join(" AND "));
});
    it("wraps one fragment", () => {
        expect(buildWhere(base, [{ op: "AND", expr: "thread_id = 5" }])).toBe(
            `${base.join(" AND ")} AND ((thread_id = 5))`,
        );
    });
    it("chains AND/OR in order, first connector ignored", () => {
        const filters = [
            { op: "OR", expr: "a=1" }, // first row: connector not used
            { op: "OR", expr: "b=2" },
            { op: "AND", expr: "c=3" },
        ];
        expect(buildWhere(base, filters)).toBe(
            `${base.join(" AND ")} AND ((a=1) OR (b=2) AND (c=3))`,
        );
    });
    it("works with an empty base", () => {
        expect(buildWhere([], [{ op: "AND", expr: "a=1" }])).toBe("((a=1))");
    });
    it("activeFilters drops blanks only", () => {
        expect(activeFilters([{ expr: "" }, { expr: "x=1" }])).toEqual([
            { op: "AND", expr: "x=1" },
        ]);
    });
});
describe("extraColumns / extraSelectSql", () => {
    const fixed = ["event_time", "level", "message"];
    it("dedupes against fixed columns, keeps pick order", () => {
        expect(extraColumns(fixed, ["thread_id", "level", "query_id",
            "thread_id"])).toEqual([
                "thread_id",
                "query_id",
            ]);
    });
    it("builds a quoted suffix with a leading comma", () => {
        expect(extraSelectSql(fixed, ["thread_id", "query_id"])).toBe(
            ", `thread_id`, `query_id`",
        );
    });
    it("returns empty string when nothing new is picked", () => {
        expect(extraSelectSql(fixed, ["level"])).toBe("");
        expect(extraSelectSql(fixed, [])).toBe("");
    });
    it("strips backticks from names", () => {
        expect(extraSelectSql(fixed, ["bad`name"])).toBe(", `badname`");
    });
});
describe("persistence", () => {
    beforeEach(() => localStorage.clear());
    it("round-trips the state", () => {
        const state = {
            columns: ["thread_id"], filters: [{
                op: "OR", expr:
                    "a=1"
            }]
        };
        saveAdvState("text_log", state);
        expect(loadAdvState("text_log")).toEqual({
            columns: ["thread_id"],
            filters: [{ op: "OR", expr: "a=1" }],
        });
    });
    it("returns the empty state for a missing key", () => {
        expect(loadAdvState("never_saved")).toEqual({
            columns: [], filters: []
        });
    });
    it("returns the empty state for corrupted JSON", () => {
        localStorage.setItem("chops_logs_adv_text_log", "{not json");
        expect(loadAdvState("text_log")).toEqual({ columns: [], filters: [] });
    });
    it("returns the empty state for an unknown version", () => {
        localStorage.setItem("chops_logs_adv_text_log", JSON.stringify({
            v: 9,
            columns: ["x"]
        }));
        expect(loadAdvState("text_log")).toEqual({ columns: [], filters: [] });
    });
    it("drops non-string column entries", () => {
        localStorage.setItem(
            "chops_logs_adv_text_log",
            JSON.stringify({ v: 1, columns: ["ok", 5, null], filters: [] }),
        );
        expect(loadAdvState("text_log").columns).toEqual(["ok"]);
    });
});