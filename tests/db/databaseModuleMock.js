// databaseModuleMock.js - The mock of src/backend/db/index.js for the tests in tests/db.
// Copyright (C) 2026 Quantrail Data Private Limited
//
// The files in tests/db run in one process, and a bun module mock stays for the rest of that
// process. A module that loads later can then get the mock of another test file. Each mock must
// therefore give all the exports of db/index.js. tests/backend/database-module-mock.test.js
// checks that this list stays complete.

import * as schema from "../../src/backend/db/schema.js";

export function databaseModuleMock(db, sqlite) {
  return {
    db,
    appSettings: schema.appSettings,
    alertRules: schema.alertRules,
    alertRuleNodeStates: schema.alertRuleNodeStates,
    alertChannels: schema.alertChannels,
    alertRuleChannels: schema.alertRuleChannels,
    dashboards: schema.dashboards,
    charts: schema.charts,
    appUsers: schema.appUsers,
    clusters: schema.clusters,
    clusterNodes: schema.clusterNodes,
    k8sConnections: schema.k8sConnections,
    k8sHealthState: schema.k8sHealthState,
    k8sHealthAlertConfigs: schema.k8sHealthAlertConfigs,
    trustedCas: schema.trustedCas,
    rawSqlite: sqlite,
    assertDatabaseReadable: () => {},
  };
}
