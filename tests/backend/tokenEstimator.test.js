import { describe, expect, test } from "bun:test";
import {
    estimateTokens,
    isOversize,
} from "../../src/backend/servicesAI/tokenEstimator.js";

describe("tokenEstimator", () => {
    describe("isOversize", () => {
        test("returns false for an OPEN AI request under the limit", () => {
            expect(isOversize(50000, "OPEN AI")).toBe(false);
        });

        test("returns true for an OPEN AI request over the limit", () => {
            expect(isOversize(9999999, "OPEN AI")).toBe(true);
        });

        test("maps CLAUDE to the anthropic context limit", () => {
            expect(isOversize(500, "CLAUDE")).toBe(false);
        });

        test("returns false for an unknown provider", () => {
            expect(isOversize(500, "made-up-name")).toBe(false);
        });

        test("returns false when provider is undefined", () => {
            expect(isOversize(500, undefined)).toBe(false);
        });
    });

    describe("estimateTokens", () => {
        test("returns 0 for zero characters", () => {
            expect(estimateTokens(0)).toBe(0);
        });

        test("returns 0 for negative character counts", () => {
            expect(estimateTokens(-5)).toBe(0);
        });
    });
});
