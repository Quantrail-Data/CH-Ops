// deleteDatabaseService.test.js - unit tests for DeleteDatabaseService
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";

const getMock = mock(() => null);
const runMock = mock(() => {});
const whereMock = mock(() => ({ get: getMock, run: runMock }));

// Every real export of db/index.js is stubbed, not just the ones this file
// uses - mock.module replaces the module for the whole test process, so
// whichever file's call happens to win must not leave another suite short
// an export.
mock.module("../../src/backend/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: whereMock }) }),
    delete: () => ({ where: whereMock }),
  },
  appSettings: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  dashboards: {},
  charts: {},
  appUsers: {},
  clusters: {},
  clusterNodes: {},
  k8sConnections: {},
  rawSqlite: {},
}));

const DeleteDatabaseService = (
  await import("../../src/backend/servicesAI/DeleteDatabaseService.js")
).default;

beforeEach(() => {
  getMock.mockReset();
  runMock.mockReset();
});

describe("DeleteDatabaseService.deleteDatabase", () => {
  it("returns false and does not delete when the row does not exist", async () => {
    getMock.mockReturnValue(undefined);

    const service = new DeleteDatabaseService();
    const result = await service.deleteDatabase("missing-db");

    expect(result).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns true and deletes the row when it exists", async () => {
    getMock.mockReturnValue({ database_id: "db1" });

    const service = new DeleteDatabaseService();
    const result = await service.deleteDatabase("db1");

    expect(result).toBe(true);
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
