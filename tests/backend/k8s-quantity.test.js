// k8s-quantity.test.js - Tests how Kubernetes memory values change into bytes.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { parseMemoryQuantity } from "../../src/backend/services/k8s/quantity.js";

describe("parseMemoryQuantity", () => {
  it("reads binary units", () => {
    expect(parseMemoryQuantity("4Gi")).toBe(4 * 1024 * 1024 * 1024);
    expect(parseMemoryQuantity("512Mi")).toBe(512 * 1024 * 1024);
    expect(parseMemoryQuantity("1.5Gi")).toBe(Math.round(1.5 * 1024 * 1024 * 1024));
  });

  it("reads decimal units", () => {
    expect(parseMemoryQuantity("4G")).toBe(4000000000);
    expect(parseMemoryQuantity("500M")).toBe(500000000);
    expect(parseMemoryQuantity("128k")).toBe(128000);
  });

  it("reads a plain number of bytes", () => {
    expect(parseMemoryQuantity("1073741824")).toBe(1073741824);
  });

  it("returns null for an empty or unknown value", () => {
    expect(parseMemoryQuantity(null)).toBe(null);
    expect(parseMemoryQuantity(undefined)).toBe(null);
    expect(parseMemoryQuantity("")).toBe(null);
    expect(parseMemoryQuantity("lots")).toBe(null);
    // "m" is milli, which is not a memory unit.
    expect(parseMemoryQuantity("100m")).toBe(null);
  });
});
