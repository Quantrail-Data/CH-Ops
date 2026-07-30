// Contributors -> Kathirdhasan, Kathir Moorthy
// k8sClient.test.js - the Kubernetes API client, its pagination and its retry behaviour
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createK8sClient,
  paths,
  selectors,
  TABLE_ACCEPT,
  METADATA_ACCEPT,
} from "../../src/backend/services/k8s/client.js";
import { K8S_ERROR } from "../../src/backend/services/k8s/errors.js";

const CONN = {
  apiAddress: "https://10.0.0.5:6443",
  caCertificate: "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----",
  token: "eyJhbGciOiJSUzI1NiJ9.fake.token",
};

const originalFetch = globalThis.fetch;
let calls;

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    body: null,
  };
}

function stubFetch(handler) {
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls.length - 1);
  };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createK8sClient: construction", () => {
  it("requires an address, a CA and a token", () => {
    expect(() => createK8sClient({ ...CONN, apiAddress: "" })).toThrow("apiAddress");
    expect(() => createK8sClient({ ...CONN, caCertificate: "" })).toThrow("caCertificate");
    expect(() => createK8sClient({ ...CONN, token: "" })).toThrow("token");
  });

  it("strips trailing slashes from the address", () => {
    expect(
      createK8sClient({ ...CONN, apiAddress: "https://10.0.0.5:6443///" }).baseUrl,
    ).toBe("https://10.0.0.5:6443");
  });
});

describe("createK8sClient: request construction", () => {
  it("sends the bearer token and the CA, with verification left on", async () => {
    stubFetch(() => jsonResponse({ kind: "PodList", items: [] }));

    await createK8sClient(CONN).get(paths.pods("prod"));

    const { options } = calls[0];
    expect(options.headers.Authorization).toBe(`Bearer ${CONN.token}`);
    expect(options.tls.ca).toBe(CONN.caCertificate);
    // The one thing that must never appear.
    expect(options.tls.rejectUnauthorized).toBeUndefined();
  });

  it("requests gzip on every call", async () => {
    stubFetch(() => jsonResponse({ items: [] }));

    await createK8sClient(CONN).get(paths.pods("prod"));

    expect(calls[0].options.headers["Accept-Encoding"]).toBe("gzip");
  });

  it("passes a label selector through as a query parameter", async () => {
    stubFetch(() => jsonResponse({ items: [] }));

    await createK8sClient(CONN).listAll(paths.pods("prod"), {
      query: { labelSelector: selectors.ownedByInstallation("analytics") },
    });

    expect(calls[0].url).toContain(
      "labelSelector=clickhouse.altinity.com%2Fchi%3Danalytics",
    );
  });

  it("omits empty query values rather than sending blanks", async () => {
    stubFetch(() => jsonResponse({ items: [] }));

    await createK8sClient(CONN).get(paths.pods("prod"), {
      query: { fieldSelector: "", limit: 10 },
    });

    expect(calls[0].url).not.toContain("fieldSelector");
    expect(calls[0].url).toContain("limit=10");
  });

  it("sends the Table accept header when asked", async () => {
    stubFetch(() => jsonResponse({ kind: "Table", rows: [] }));

    await createK8sClient(CONN).get(paths.installations("prod"), {
      accept: TABLE_ACCEPT,
    });

    expect(calls[0].options.headers.Accept).toBe(TABLE_ACCEPT);
  });
});

describe("createK8sClient: listAll pagination", () => {
  it("follows the continuation cursor and concatenates every page", async () => {
    stubFetch((url) => {
      if (url.includes("continue=cursor-2")) {
        return jsonResponse({ items: [{ n: 5 }], metadata: {} });
      }
      if (url.includes("continue=cursor-1")) {
        return jsonResponse({
          items: [{ n: 3 }, { n: 4 }],
          metadata: { continue: "cursor-2" },
        });
      }
      return jsonResponse({
        items: [{ n: 1 }, { n: 2 }],
        metadata: { continue: "cursor-1" },
      });
    });

    const items = await createK8sClient(CONN).listAll(paths.pods("prod"));

    expect(items).toHaveLength(5);
    expect(items.map((i) => i.n)).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toHaveLength(3);
  });

  it("stops after a single page when no cursor is returned", async () => {
    stubFetch(() => jsonResponse({ items: [{ n: 1 }], metadata: {} }));

    const items = await createK8sClient(CONN).listAll(paths.pods("prod"));

    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("treats an empty-string cursor as the end, not as another page", async () => {
    stubFetch(() => jsonResponse({ items: [{ n: 1 }], metadata: { continue: "" } }));

    const items = await createK8sClient(CONN).listAll(paths.pods("prod"));

    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("returns an empty array when the collection has no items", async () => {
    stubFetch(() => jsonResponse({ items: [], metadata: {} }));

    expect(await createK8sClient(CONN).listAll(paths.pods("prod"))).toEqual([]);
  });

  it("survives a page with no items field at all", async () => {
    stubFetch(() => jsonResponse({ metadata: {} }));

    expect(await createK8sClient(CONN).listAll(paths.pods("prod"))).toEqual([]);
  });

  it("sends a page size on the first request", async () => {
    stubFetch(() => jsonResponse({ items: [], metadata: {} }));

    await createK8sClient(CONN).listAll(paths.pods("prod"));

    expect(calls[0].url).toContain("limit=500");
  });

  it("aborts rather than looping forever on a server that always paginates", async () => {
    stubFetch(() =>
      jsonResponse({ items: [{ n: 1 }], metadata: { continue: "never-ending" } }),
    );

    await expect(
      createK8sClient(CONN).listAll(paths.pods("prod")),
    ).rejects.toMatchObject({ code: K8S_ERROR.SERVER_ERROR });
  });
});

describe("createK8sClient: retry behaviour", () => {
  it("retries a 429 and succeeds on the follow-up", async () => {
    stubFetch((_url, _options, index) => {
      if (index === 0) {
        return jsonResponse({}, { status: 429, headers: { "retry-after": "0" } });
      }
      return jsonResponse({ items: [{ n: 1 }], metadata: {} });
    });

    const items = await createK8sClient(CONN).listAll(paths.pods("prod"));

    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("gives up after the retry budget and reports throttling", async () => {
    stubFetch(() => jsonResponse({}, { status: 429, headers: { "retry-after": "0" } }));

    await expect(createK8sClient(CONN).get(paths.pods("prod"))).rejects.toMatchObject({
      code: K8S_ERROR.THROTTLED,
    });
    // One original attempt plus three retries.
    expect(calls).toHaveLength(4);
  });

  it("does not retry a 403", async () => {
    stubFetch(() => jsonResponse({ message: "forbidden" }, { status: 403 }));

    await expect(createK8sClient(CONN).get(paths.pods("prod"))).rejects.toMatchObject({
      code: K8S_ERROR.FORBIDDEN,
    });
    expect(calls).toHaveLength(1);
  });

  it("does not retry a 401", async () => {
    stubFetch(() => jsonResponse({}, { status: 401 }));

    await expect(createK8sClient(CONN).get(paths.pods("prod"))).rejects.toMatchObject({
      code: K8S_ERROR.UNAUTHORIZED,
    });
    expect(calls).toHaveLength(1);
  });

  it("surfaces a transport failure as a classified error", async () => {
    globalThis.fetch = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:6443");
    };

    await expect(createK8sClient(CONN).get(paths.pods("prod"))).rejects.toMatchObject({
      code: K8S_ERROR.UNREACHABLE,
    });
  });

  it("tolerates a non-JSON error body", async () => {
    stubFetch(() => ({
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
    }));

    await expect(createK8sClient(CONN).get(paths.pods("prod"))).rejects.toMatchObject({
      code: K8S_ERROR.SERVER_ERROR,
    });
  });
});

describe("paths", () => {
  it("puts core resources under /api/v1 with no group segment", () => {
    expect(paths.pods("prod")).toBe("/api/v1/namespaces/prod/pods");
    expect(paths.pvcs("prod")).toBe("/api/v1/namespaces/prod/persistentvolumeclaims");
    expect(paths.namespaces()).toBe("/api/v1/namespaces");
  });

  it("puts grouped resources under /apis/GROUP/VERSION", () => {
    expect(paths.statefulSets("prod")).toBe("/apis/apps/v1/namespaces/prod/statefulsets");
    expect(paths.podDisruptionBudgets("prod")).toBe(
      "/apis/policy/v1/namespaces/prod/poddisruptionbudgets",
    );
  });

  it("uses EndpointSlice rather than the deprecated core Endpoints API", () => {
    expect(paths.endpointSlices("prod")).toBe(
      "/apis/discovery.k8s.io/v1/namespaces/prod/endpointslices",
    );
  });

  it("builds the installation paths for both operator API groups", () => {
    expect(paths.installations("prod")).toBe(
      "/apis/clickhouse.altinity.com/v1/namespaces/prod/clickhouseinstallations",
    );
    expect(paths.keeperInstallations("prod")).toBe(
      "/apis/clickhouse-keeper.altinity.com/v1/namespaces/prod/clickhousekeeperinstallations",
    );
  });

  it("keeps storage classes cluster-scoped", () => {
    expect(paths.storageClasses()).toBe("/apis/storage.k8s.io/v1/storageclasses");
  });
});

describe("selectors", () => {
  it("uses the operator label for installation ownership", () => {
    expect(selectors.ownedByInstallation("analytics")).toBe(
      "clickhouse.altinity.com/chi=analytics",
    );
  });

  it("uses the separate Keeper label prefix", () => {
    expect(selectors.keeperOwnedBy("keeper")).toBe(
      "clickhouse-keeper.altinity.com/chk=keeper",
    );
  });

  it("selects endpoint slices by service name", () => {
    expect(selectors.slicesForService("clickhouse-analytics")).toBe(
      "kubernetes.io/service-name=clickhouse-analytics",
    );
  });
});

describe("accept headers", () => {
  it("asks for Table with a JSON fallback", () => {
    expect(TABLE_ACCEPT).toContain("as=Table");
    expect(TABLE_ACCEPT).toContain("application/json");
  });

  it("asks for PartialObjectMetadata with a JSON fallback", () => {
    expect(METADATA_ACCEPT).toContain("as=PartialObjectMetadata");
    expect(METADATA_ACCEPT).toContain("application/json");
  });
});
