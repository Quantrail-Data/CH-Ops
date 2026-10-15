// systemSmtp.test.js - unit coverage for the system SMTP settings service
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as schema from "../../src/backend/db/schema.js";

let readValues = [];
let existing = null;
let environment = {};
const insertValues = mock(() => ({ run: mock(() => {}) }));
const updateSet = mock(() => ({ where: mock(() => ({ run: mock(() => {}) })) }));
const deleteRun = mock(() => {});
const encrypt = mock(password => `encrypted:${password}`);
const decrypt = mock(value => `decrypted:${value}`);

mock.module("../../src/backend/db/index.js", () => ({
  appSettings: schema.appSettings,
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => {
            const value = readValues.shift();
            if (value !== undefined) return value === null ? null : { value };
            return existing;
          },
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: () => ({ run: deleteRun }) }),
  },
}));

mock.module("../../src/backend/services/crypto.js", () => ({ encrypt, decrypt }));
mock.module("../../src/backend/utils/env.js", () => ({ loadEnv: () => environment }));

const {
  deleteSystemSmtp,
  readStoredSmtp,
  resolveSystemSmtp,
  saveSystemSmtp,
} = await import("../../src/backend/services/systemSmtp.js");

beforeEach(() => {
  readValues = [];
  existing = null;
  environment = {};
  insertValues.mockClear();
  updateSet.mockClear();
  deleteRun.mockClear();
  encrypt.mockClear();
  decrypt.mockClear();
});

describe("readStoredSmtp", () => {
  it("returns null until a host is stored", () => {
    expect(readStoredSmtp()).toBeNull();
  });

  it("reads stored fields and supplies defaults for optional values", () => {
    readValues = ["smtp.example.com", null, "true", null, "ciphertext", null];

    expect(readStoredSmtp()).toEqual({
      host: "smtp.example.com",
      port: "587",
      secure: true,
      user: "",
      passwordEnc: "ciphertext",
      from: "",
    });
  });
});

describe("saveSystemSmtp", () => {
  it("inserts normalized fields and encrypts a supplied password", () => {
    saveSystemSmtp({
      host: "  smtp.example.com  ", port: 465, secure: true,
      user: "mailer", password: "secret", from: "sender@example.com",
    });

    expect(encrypt).toHaveBeenCalledWith("secret");
    expect(insertValues).toHaveBeenCalledTimes(6);
    expect(insertValues).toHaveBeenCalledWith({ key: "smtp.host", value: "smtp.example.com", category: "smtp" });
    expect(insertValues).toHaveBeenCalledWith({ key: "smtp.passwordEnc", value: "encrypted:secret", category: "smtp" });
  });

  it("keeps the existing password when the request leaves it blank", () => {
    saveSystemSmtp({ host: "smtp.example.com", password: "" });

    expect(encrypt).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledTimes(5);
  });

  it("updates fields that already exist", () => {
    existing = { id: 7 };
    saveSystemSmtp({ host: "smtp.example.com", password: "" });

    expect(updateSet).toHaveBeenCalledTimes(5);
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("deleteSystemSmtp", () => {
  it("removes every SMTP setting", () => {
    deleteSystemSmtp();
    expect(deleteRun).toHaveBeenCalledTimes(6);
  });
});

describe("resolveSystemSmtp", () => {
  it("uses decrypted database settings before environment settings", () => {
    readValues = ["db.example.com", "465", "true", "database-user", "ciphertext", "db@example.com"];
    environment = { smtp: { host: "env.example.com" } };

    expect(resolveSystemSmtp()).toEqual({
      host: "db.example.com", port: "465", secure: true, user: "database-user",
      pass: "decrypted:ciphertext", from: "db@example.com", source: "database",
    });
    expect(decrypt).toHaveBeenCalledWith("ciphertext");
  });

  it("uses an empty password when the stored password is absent", () => {
    readValues = ["db.example.com", "587", "false", "user", "", "from@example.com"];
    expect(resolveSystemSmtp().pass).toBe("");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("does not use environment SMTP when it is disabled or incomplete", () => {
    environment = { disableEnvSmtp: true, smtp: { host: "env.example.com" } };
    expect(resolveSystemSmtp()).toBeNull();

    environment = { disableEnvSmtp: false, smtp: {} };
    expect(resolveSystemSmtp()).toBeNull();
  });

  it("falls back to environment SMTP", () => {
    environment = {
      smtp: { host: "env.example.com", port: "2525", user: "env-user", pass: "env-pass", from: "env@example.com" },
    };

    expect(resolveSystemSmtp()).toEqual({
      host: "env.example.com", port: "2525", secure: false, user: "env-user",
      pass: "env-pass", from: "env@example.com", source: "environment",
    });
  });
});
