// systemSmtpResolve.test.js - which SMTP configuration wins
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect } from "bun:test";

// The precedence rule on its own, with no database or environment behind it.
// The real function reads both; this checks the decision it makes.
function resolve({ stored, env, disableEnvSmtp }) {
  if (stored?.host) return { ...stored, source: "database" };
  if (disableEnvSmtp) return null;
  if (!env?.host) return null;
  return { ...env, source: "environment" };
}

const stored = { host: "db.example.com", port: "587", user: "a", pass: "b", from: "f" };
const env = { host: "env.example.com", port: "25", user: "c", pass: "d", from: "g" };

describe("system smtp resolution", () => {
  test("the database wins when it has a host", () => {
    const r = resolve({ stored, env });
    expect(r.host).toBe("db.example.com");
    expect(r.source).toBe("database");
  });

  test("the environment is used when the database is empty", () => {
    const r = resolve({ stored: null, env });
    expect(r.host).toBe("env.example.com");
    expect(r.source).toBe("environment");
  });

  test("null when neither is set", () => {
    expect(resolve({ stored: null, env: null })).toBeNull();
  });

  test("DISABLE_ENV_SMTP blocks the fallback", () => {
    expect(resolve({ stored: null, env, disableEnvSmtp: true })).toBeNull();
  });

  test("DISABLE_ENV_SMTP does not affect a stored configuration", () => {
    // It disables the fallback, not the feature.
    const r = resolve({ stored, env, disableEnvSmtp: true });
    expect(r.source).toBe("database");
  });
});
