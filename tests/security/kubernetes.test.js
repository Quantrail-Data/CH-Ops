// kubernetes.test.js - Kubernetes discovery, refresh and Keeper routes.
// Checks admin only access, Kubernetes name checks before any API call, and password redaction.
// A fake Kubernetes API runs over HTTPS with the test-only certificates in ./fixtures.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import { startServer } from "./harness.js";

const FIXTURES = path.join(import.meta.dir, "fixtures");
const INSTALLATION_PASSWORD = "installation-secret-password";
const INSTALLATION_PATH =
  "/apis/clickhouse.altinity.com/v1/namespaces/default/clickhouseinstallations/demo";

// An Altinity operator installation with a password in its spec, as people often write it.
const INSTALLATION = {
  metadata: { name: "demo", namespace: "default" },
  spec: {
    configuration: {
      users: {
        "admin/password": INSTALLATION_PASSWORD,
        "admin/networks/ip": "::/0",
      },
      clusters: [
        { name: "main", layout: { shardsCount: 1, replicasCount: 2 } },
      ],
    },
  },
  status: {
    status: "Completed",
    normalizedCompleted: {
      configuration: { users: { "admin/password": INSTALLATION_PASSWORD } },
    },
  },
};

let app;
let fakeKubernetesApi;
let connectionId;
// The path of each request that reached the fake Kubernetes API.
const kubernetesRequests = [];

function startFakeKubernetesApi() {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    tls: {
      cert: Bun.file(path.join(FIXTURES, "test-kubernetes-api.pem")),
      key: Bun.file(path.join(FIXTURES, "test-kubernetes-api-key.pem")),
    },
    fetch(request) {
      const requestPath = new URL(request.url).pathname;
      kubernetesRequests.push(requestPath);
      if (requestPath === INSTALLATION_PATH) return Response.json(INSTALLATION);
      return Response.json({ kind: "List", metadata: {}, items: [] });
    },
  });
}

beforeAll(async () => {
  fakeKubernetesApi = startFakeKubernetesApi();
  app = await startServer();

  const caCertificate = await Bun.file(
    path.join(FIXTURES, "test-kubernetes-ca.pem"),
  ).text();
  const created = await app.api("superadmin", "POST", "/api/k8s/connections", {
    name: "test-kubernetes",
    apiAddress: `https://127.0.0.1:${fakeKubernetesApi.port}`,
    caCertificate,
    token: "test-token",
  });
  if (!created.json?.id)
    throw new Error(`Connection create failed: ${created.text}`);
  connectionId = created.json.id;
}, 30000);

afterAll(async () => {
  await app?.stop();
  fakeKubernetesApi?.stop(true);
});

describe("admin only routes", () => {
  function adminOnlyCalls() {
    return [
      ["GET", `/api/k8s/connections/${connectionId}/namespaces`],
      [
        "GET",
        `/api/k8s/connections/${connectionId}/installations?namespace=default`,
      ],
      [
        "GET",
        `/api/k8s/connections/${connectionId}/installations/demo?namespace=default`,
      ],
      ["POST", `/api/k8s/clusters/${app.clusterId}/refresh`],
      ["POST", `/api/k8s/insight/${app.clusterId}/refresh`],
      ["GET", `/api/k8s/insight/${app.clusterId}/keeper`],
    ];
  }

  for (const role of ["readonly", "editor"]) {
    it(`refuses every discovery, refresh and Keeper call from ${role}`, async () => {
      kubernetesRequests.length = 0;
      const results = [];
      for (const [method, url] of adminOnlyCalls()) {
        const result = await app.api(role, method, url);
        results.push(`${method} ${url} ${result.status}`);
      }
      const expected = adminOnlyCalls().map(
        ([method, url]) => `${method} ${url} 403`,
      );
      expect(results).toEqual(expected);
      expect(kubernetesRequests).toEqual([]);
    });
  }
});

describe("installation details", () => {
  it("returns the installation to an admin with every password redacted", async () => {
    const result = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations/demo?namespace=default&operator=akoc`,
    );
    expect(result.status).toBe(200);
    expect(result.json.name).toBe("demo");
    expect(result.json.spec.configuration.users["admin/password"]).toBe(
      "[redacted]",
    );
    expect(result.json.spec.configuration.users["admin/networks/ip"]).toBe(
      "::/0",
    );
    expect(result.text).not.toContain(INSTALLATION_PASSWORD);
  });
});

describe("Kubernetes name checks", () => {
  it("refuses an installation name that leaves its path segment", async () => {
    kubernetesRequests.length = 0;
    for (const operator of ["akoc", "ocko"]) {
      const result = await app.api(
        "admin",
        "GET",
        `/api/k8s/connections/${connectionId}/installations/..%2F..%2F..%2Fapi%2Fv1%2Fsecrets?namespace=default&operator=${operator}`,
      );
      expect(result.status).toBe(400);
      expect(result.json.error).toBe("A valid installation name is required.");
    }
    expect(kubernetesRequests).toEqual([]);
  });

  it("refuses a missing or invalid namespace", async () => {
    kubernetesRequests.length = 0;
    const missing = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations`,
    );
    const withSlash = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations?namespace=kube-system%2Fsecrets`,
    );
    const upperCase = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations?namespace=Default`,
    );
    const missingForDetails = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations/demo`,
    );
    expect([
      missing.status,
      withSlash.status,
      upperCase.status,
      missingForDetails.status,
    ]).toEqual([400, 400, 400, 400]);
    expect(kubernetesRequests).toEqual([]);
  });

  it("refuses an import with an invalid namespace or installation", async () => {
    const badNamespace = await app.api("admin", "POST", "/api/k8s/import", {
      connectionId,
      namespace: "../kube-system",
      installation: "demo",
      endpoint: "clickhouse.example.com",
    });
    const badInstallation = await app.api("admin", "POST", "/api/k8s/import", {
      connectionId,
      namespace: "default",
      installation: "demo/../other",
      endpoint: "clickhouse.example.com",
    });
    const nameError =
      "The namespace or installation is not a valid Kubernetes name.";
    expect([badNamespace.status, badInstallation.status]).toEqual([400, 400]);
    expect([badNamespace.json.error, badInstallation.json.error]).toEqual([
      nameError,
      nameError,
    ]);
  });

  it("refuses a connection test with an invalid namespace", async () => {
    const result = await app.api("admin", "POST", "/api/k8s/test", {
      connectionId,
      namespace: "default/../kube-system",
    });
    expect(result.status).toBe(400);
  });

  it("still lists installations for a valid namespace", async () => {
    kubernetesRequests.length = 0;
    const result = await app.api(
      "admin",
      "GET",
      `/api/k8s/connections/${connectionId}/installations?namespace=default&operator=akoc`,
    );
    expect(result.status).toBe(200);
    expect(kubernetesRequests.length).toBeGreaterThan(0);
  });
});
