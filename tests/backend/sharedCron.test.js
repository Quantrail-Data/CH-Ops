// sharedCron.test.js - The cron check that the server and the Alert Rules page share.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { validateCronExpression, cronMatches } from "../../src/shared/cron.js";

describe("validateCronExpression", () => {
  it("refuses 4 fields", () => {
    expect(validateCronExpression("0 * * *")).toBe("Cron must have 5 fields");
  });

  it("refuses 6 fields and an empty text", () => {
    expect(validateCronExpression("0 0 * * * *")).toBe("Cron must have 5 fields");
    expect(validateCronExpression("")).toBe("Cron must have 5 fields");
  });

  it("accepts *, */n and comma lists", () => {
    for (const expr of ["* * * * *", "*/5 * * * *", "0,30 9 1 1,6 0,6", "  0 9 * * 1  "]) {
      expect([expr, validateCronExpression(expr)]).toEqual([expr, null]);
    }
  });

  it("refuses ranges, bad steps and numbers out of range", () => {
    for (const expr of ["0 9 * * 1-5", "*/0 * * * *", "*/x * * * *", "60 * * * *", "0 9 * * 7", "0 9 * * 1,"]) {
      expect([expr, typeof validateCronExpression(expr)]).toEqual([expr, "string"]);
    }
  });
});

describe("cronMatches", () => {
  const mondayAt0905 = new Date(2026, 10, 2, 9, 5);

  it("matches steps, lists and the day of week", () => {
    expect(cronMatches("*/5 * * * *", mondayAt0905)).toBe(true);
    expect(cronMatches("5 9 * * 1", mondayAt0905)).toBe(true);
    expect(cronMatches("0,5 9 2 11 *", mondayAt0905)).toBe(true);
  });

  it("does not match another minute or day", () => {
    expect(cronMatches("*/10 * * * *", mondayAt0905)).toBe(false);
    expect(cronMatches("5 9 * * 0", mondayAt0905)).toBe(false);
  });

  it("never matches an invalid expression", () => {
    expect(cronMatches("5 9 * *", mondayAt0905)).toBe(false);
  });
});
