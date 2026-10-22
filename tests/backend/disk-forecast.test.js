// disk-forecast.test.js - Days-until-full math, no mocks.
// Copyright (C) 2026 Quantrail Data Private Limited
import { describe, it, expect } from "bun:test";
import { buildDiskForecast } from "../../src/backend/services/k8s/diskForecast.js";

const isoDateAfterDays = (days) =>
  new Date(Date.parse("2026-10-01T00:00:00Z") + days * 86400000).toISOString();

const growingSample = {
  host: "node1",
  metric: "DiskUsed_default",
  oldest_value: 100e9,
  oldest_time: isoDateAfterDays(0),
  newest_value: 110e9,
  newest_time: isoDateAfterDays(5),
};
const oneDisk = [{ host: "node1", name: "default", free_space: 20e9 }];

describe("buildDiskForecast", () => {
  it("computes the growth rate and days until full", () => {
    const forecast = buildDiskForecast([growingSample], oneDisk);
    expect(Math.round(forecast["node1|default"].growthBytesPerDay)).toBe(2e9);
    expect(forecast["node1|default"].daysUntilFull).toBe(10);
  });

  it("gives no day count for a shrinking disk", () => {
    const forecast = buildDiskForecast(
      [{ ...growingSample, newest_value: 90e9 }],
      oneDisk,
    );
    expect(forecast["node1|default"].daysUntilFull).toBe(null);
    expect(forecast["node1|default"].growthBytesPerDay).toBeLessThan(0);
  });

  it("skips samples with under one hour of history", () => {
    const forecast = buildDiskForecast(
      [{ ...growingSample, newest_time: isoDateAfterDays(0.02) }],
      oneDisk,
    );
    expect(forecast).toEqual({});
  });

  it("gives no day count when the disk row is missing", () => {
    const forecast = buildDiskForecast(
      [growingSample],
      [{ host: "node2", name: "default", free_space: 1 }],
    );
    expect(forecast["node1|default"].daysUntilFull).toBe(null);
  });

  it("tolerates garbage input", () => {
    expect(buildDiskForecast(null, null)).toEqual({});
    expect(buildDiskForecast([{}], [{}])).toEqual({});
  });
});
