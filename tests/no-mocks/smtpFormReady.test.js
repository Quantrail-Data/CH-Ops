// smtpFormReady.test.js - when the System Email form may be submitted
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect } from "bun:test";

// The rule from UserManagement.jsx. 

function smtpFormReady(smtpForm, smtp) {
  if (!smtpForm) return false;
  if (!smtpForm.host?.trim()) return false;
  if (!smtpForm.from?.trim()) return false;

  const port = parseInt(smtpForm.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;

  if (smtpForm.user?.trim() && !smtpForm.password && !smtp?.hasPassword) return false;

  return true;
}

const full = { host: "smtp.example.com", port: "587", user: "u", password: "p", from: "f@e.com" };
const noStored = { hasPassword: false };
const stored = { hasPassword: true };

describe("smtp form readiness", () => {
  test("a complete form is submittable", () => {
    expect(smtpFormReady(full, noStored)).toBe(true);
  });

  test("a username with no password is not, when none is stored", () => {
    // This is the case that produced nodemailer's "Missing credentials for
    // PLAIN", which reads like a bug rather than a missing field.
    expect(smtpFormReady({ ...full, password: "" }, noStored)).toBe(false);
  });

  test("a username with no password is fine when one is stored", () => {
    // The field is deliberately left blank to mean unchanged, so requiring a
    // password here would make an existing configuration uneditable.
    expect(smtpFormReady({ ...full, password: "" }, stored)).toBe(true);
  });

  test("no username and no password is valid", () => {
    // notifier.js only builds an auth block when a user is given, so a relay
    // that needs no authentication is a real configuration.
    expect(smtpFormReady({ ...full, user: "", password: "" }, noStored)).toBe(true);
  });

  test("a host is required", () => {
    expect(smtpFormReady({ ...full, host: "" }, noStored)).toBe(false);
    expect(smtpFormReady({ ...full, host: "   " }, noStored)).toBe(false);
  });

  test("a from address is required", () => {
    expect(smtpFormReady({ ...full, from: "" }, noStored)).toBe(false);
    expect(smtpFormReady({ ...full, from: "   " }, noStored)).toBe(false);
  });

  test("the port must be a number in range", () => {
    expect(smtpFormReady({ ...full, port: "abc" }, noStored)).toBe(false);
    expect(smtpFormReady({ ...full, port: "0" }, noStored)).toBe(false);
    expect(smtpFormReady({ ...full, port: "99999" }, noStored)).toBe(false);
    expect(smtpFormReady({ ...full, port: "1" }, noStored)).toBe(true);
    expect(smtpFormReady({ ...full, port: "65535" }, noStored)).toBe(true);
  });

  test("no form at all is not submittable", () => {
    // The form is null until the tab is opened and the settings load.
    expect(smtpFormReady(null, noStored)).toBe(false);
  });

  test("whitespace does not count as a username", () => {
    expect(smtpFormReady({ ...full, user: "   ", password: "" }, noStored)).toBe(true);
  });
});
