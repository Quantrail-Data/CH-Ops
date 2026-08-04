// k8sErrors.test.js - turning Kubernetes failures into messages somebody can act on
// Contributors - Praveen kumar, Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect } from "bun:test";
import {
  K8S_ERROR,
  K8sError,
  classifyTransportError,
  classifyResponseError,
  isRetryable,
} from "../../src/backend/services/k8s/errors.js";

describe("classifyTransportError: TLS failures", () => {
  it("classifies a self-signed certificate as an untrusted CA", () => {
    const result = classifyTransportError(
      new Error("self-signed certificate in certificate chain"),
    );

    expect(result.code).toBe(K8S_ERROR.CERT_UNTRUSTED);
    expect(result.message).toContain("CA certificate does not match");
  });

  it("classifies an unknown authority as an untrusted CA", () => {
    expect(
      classifyTransportError(new Error("x509: certificate signed by unknown authority"))
        .code,
    ).toBe(K8S_ERROR.CERT_UNTRUSTED);
  });

  it("classifies a hostname mismatch separately from an untrusted CA", () => {
    const result = classifyTransportError(
      new Error("Hostname/IP does not match certificate's altnames"),
    );

    expect(result.code).toBe(K8S_ERROR.CERT_HOSTNAME);
    expect(result.message).toContain("does not cover this address");
  });

  it("prefers the hostname classification when both hints are present", () => {
    // Some stacks report both. Hostname is the more specific diagnosis and the
    // more actionable one, so it must win.
    const result = classifyTransportError(
      new Error("unable to verify the first certificate: Hostname/IP does not match"),
    );

    expect(result.code).toBe(K8S_ERROR.CERT_HOSTNAME);
  });

  it("reads the code from a nested cause", () => {
    const err = new Error("fetch failed");
    err.cause = { code: "ECONNREFUSED" };

    expect(classifyTransportError(err).code).toBe(K8S_ERROR.UNREACHABLE);
  });
});

describe("classifyTransportError: network failures", () => {
  const cases = [
    ["ECONNREFUSED", "connect ECONNREFUSED 10.0.0.5:6443"],
    ["ETIMEDOUT", "connect ETIMEDOUT"],
    ["EHOSTUNREACH", "connect EHOSTUNREACH"],
    ["ENOTFOUND", "getaddrinfo ENOTFOUND k8s.internal"],
  ];

  for (const [label, message] of cases) {
    it(`classifies ${label} as unreachable`, () => {
      const result = classifyTransportError(new Error(message));

      expect(result.code).toBe(K8S_ERROR.UNREACHABLE);
      expect(result.message).toContain("restricts API access");
    });
  }

  it("falls back to unknown for an unrecognised error", () => {
    expect(classifyTransportError(new Error("something else entirely")).code).toBe(
      K8S_ERROR.UNKNOWN,
    );
  });

  // The function returns an error rather than throwing one, so toThrow would be
  // testing the runner's handling of a returned Error instead of this code.
  it("returns a classification for an error with no message", () => {
    const result = classifyTransportError({});
    expect(result.code).toBe(K8S_ERROR.UNKNOWN);
    expect(result.message).toContain("unrecognised");
  });

  it("carries context through into details", () => {
    const result = classifyTransportError(new Error("ECONNREFUSED"), {
      namespace: "prod",
    });

    expect(result.details.namespace).toBe("prod");
  });
});

describe("classifyResponseError: HTTP statuses", () => {
  it("classifies 401 as a rejected token and points at the setup script", () => {
    const result = classifyResponseError(401, { message: "Unauthorized" });

    expect(result.code).toBe(K8S_ERROR.UNAUTHORIZED);
    expect(result.message).toContain("setup script");
  });

  it("names the verb, resource and namespace on 403", () => {
    const result = classifyResponseError(
      403,
      { message: "forbidden" },
      { verb: "list", resource: "persistentvolumeclaims", namespace: "prod" },
    );

    expect(result.code).toBe(K8S_ERROR.FORBIDDEN);
    expect(result.message).toContain("list persistentvolumeclaims");
    expect(result.message).toContain("in namespace prod");
  });

  it("falls back to generic wording on 403 with no context", () => {
    const result = classifyResponseError(403, {});

    expect(result.code).toBe(K8S_ERROR.FORBIDDEN);
    expect(result.message).toContain("perform this action");
  });

  it("reads a 404 on a custom resource path as a missing operator", () => {
    const result = classifyResponseError(404, {}, { isCustomResource: true });

    expect(result.code).toBe(K8S_ERROR.OPERATOR_MISSING);
    expect(result.message).toContain("Kubernetes Operator for ClickHouse");
  });

  it("reads a 404 on a core path as a missing object", () => {
    const result = classifyResponseError(404, { message: "pods 'x' not found" });

    expect(result.code).toBe(K8S_ERROR.NOT_FOUND);
    expect(result.message).toContain("not found");
  });

  it("classifies 429 as throttled", () => {
    expect(classifyResponseError(429, {}).code).toBe(K8S_ERROR.THROTTLED);
  });

  it("classifies 500 and 503 as a server-side problem", () => {
    expect(classifyResponseError(500, {}).code).toBe(K8S_ERROR.SERVER_ERROR);
    expect(classifyResponseError(503, {}).code).toBe(K8S_ERROR.SERVER_ERROR);
  });

  it("surfaces the server message when the status is unrecognised", () => {
    const result = classifyResponseError(418, { message: "I am a teapot" });

    expect(result.code).toBe(K8S_ERROR.UNKNOWN);
    expect(result.message).toBe("I am a teapot");
  });

  it("keeps the status in details for logging", () => {
    const result = classifyResponseError(403, { message: "no" }, { namespace: "prod" });

    expect(result.details.status).toBe(403);
    expect(result.details.namespace).toBe("prod");
  });
});

describe("isRetryable", () => {
  it("is true only for throttling", () => {
    expect(isRetryable(classifyResponseError(429, {}))).toBe(true);
    expect(isRetryable(classifyResponseError(403, {}))).toBe(false);
    expect(isRetryable(classifyResponseError(500, {}))).toBe(false);
  });

  it("is false for a plain Error", () => {
    expect(isRetryable(new Error("boom"))).toBe(false);
  });

  it("recognises a K8sError constructed directly", () => {
    expect(isRetryable(new K8sError(K8S_ERROR.THROTTLED, "slow down"))).toBe(true);
  });
});
