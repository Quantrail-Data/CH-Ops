// k8s-rbac-context.test.js - An editor gets only the session affinity part of the RBAC context.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock } from "bun:test";

const FULL_CONTEXT = {
  replicaCount: 2,
  defaultOnCluster: "demo",
  warnAboutOnCluster: true,
  users: [{ name: "default", storage: "users_xml", readOnly: true, nodeLocal: false }],
  accessStorageReplicated: false,
  sessionAffinity: { checked: true, sticky: false, hosts: ["pod-0", "pod-1"] },
};

const realCapabilities = await import("../../src/backend/services/capabilities.js");
mock.module("../../src/backend/services/capabilities.js", () => ({
  ...realCapabilities,
  rbacContext: async () => FULL_CONTEXT,
}));

const { getRbacContext } = await import("../../src/backend/controllers/k8sInsight.js");

async function callAs(role) {
  let body = null;
  const res = {
    status() {
      return res;
    },
    json(value) {
      body = value;
      return res;
    },
  };
  await getRbacContext({ params: { clusterId: "k8s_demo" }, user: { role } }, res);
  return body;
}

describe("GET rbac-context", () => {
  it("gives an editor only whether the session stays on one replica", async () => {
    expect(await callAs("editor")).toEqual({
      sessionAffinity: { checked: true, sticky: false },
    });
  });

  it("gives an admin the full context", async () => {
    expect(await callAs("admin")).toEqual(FULL_CONTEXT);
    expect(await callAs("superadmin")).toEqual(FULL_CONTEXT);
  });
});
