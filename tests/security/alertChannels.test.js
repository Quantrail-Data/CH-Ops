// alertChannels.test.js - end-to-end tests covering secrets at rest, scheduler decryption, and channel edit flows
// Contributors - Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, ENCRYPTION_SECRET } from "./harness.js";
import { initCrypto, decrypt } from "../../src/backend/services/crypto.js";
import { DecryptValuesChannels } from "../../src/backend/controllers/alerts.js";

const MASK = "*".repeat(15);

const CHANNEL_TYPES = [
  {
    type: "email",
    plain: { smtp_host: "smtp.example.com", to: "ops@example.com" },
    secretField: "smtp_pass",
    secret: "mail-pass",
  },
  {
    type: "slack",
    plain: { channel: "#ops" },
    secretField: "bot_token",
    secret: "xoxb-token",
  },
  {
    type: "google_chat",
    plain: {},
    secretField: "webhook_url",
    secret: "https://chat.example.com/hook",
  },
  {
    type: "teams",
    plain: {},
    secretField: "webhook_url",
    secret: "https://teams.example.com/hook",
  },
  {
    type: "pagerduty",
    plain: {},
    secretField: "routing_key",
    secret: "pd-routing-key",
  },
];

let app;
const channelIds = {};

function readChannelRow(channelId) {
  const database = app.openDatabase();
  const row = database
    .query("SELECT * FROM alert_channel WHERE id = ?")
    .get(channelId);
  database.close();
  return row;
}

beforeAll(async () => {
  app = await startServer();
  initCrypto(ENCRYPTION_SECRET);

  for (const sample of CHANNEL_TYPES) {
    const created = await app.api("superadmin", "POST", "/api/alerts/channels", {
      name: `channel-${sample.type}`,
      type: sample.type,
      config: { ...sample.plain, [sample.secretField]: sample.secret },
    });
    channelIds[sample.type] = created.json.id;
  }

  await app.api("superadmin", "POST", "/api/alerts/rules", {
    name: "rule-with-channels",
    sql: "SELECT 1",
    schedule: "*/5 * * * *",
    enabled: false,
    cluster_id: app.clusterId,
    channel_ids: Object.values(channelIds),
  });
}, 30000);

afterAll(() => app?.stop());

describe("secrets at rest", () => {
  for (const sample of CHANNEL_TYPES) {
    it(`stores the ${sample.type} secret encrypted`, () => {
      const stored = JSON.parse(readChannelRow(channelIds[sample.type]).config);
      expect(stored[sample.secretField]).not.toBe(sample.secret);
      expect(decrypt(stored[sample.secretField])).toBe(sample.secret);
    });
  }
});

describe("what the alert scheduler sends (C1)", () => {
  for (const sample of CHANNEL_TYPES) {
    it(`gives the ${sample.type} sender every field and the decrypted secret`, () => {
      const row = readChannelRow(channelIds[sample.type]);
      expect(typeof row.config).toBe("string");
      const config = DecryptValuesChannels(row.config, row.type);
      for (const [field, value] of Object.entries(sample.plain)) {
        expect(config[field]).toBe(value);
      }
      expect(config[sample.secretField]).toBe(sample.secret);
      expect(config["0"]).toBeUndefined();
    });
  }
});

describe("what each role sees (S3)", () => {
  it("shows admins the channel list with every secret masked", async () => {
    const list = await app.api("admin", "GET", "/api/alerts/channels");
    for (const sample of CHANNEL_TYPES) {
      const channel = list.json.find((c) => c.id === channelIds[sample.type]);
      const config =
        typeof channel.config === "string"
          ? JSON.parse(channel.config)
          : channel.config;
      expect(config[sample.secretField]).toBe(MASK);
    }
    expect(list.text).not.toContain("mail-pass");
  });

  it("shows admins the rule list with every secret masked and readable fields", async () => {
    const rules = await app.api("admin", "GET", "/api/alerts/rules");
    const rule = rules.json.find((r) => r.name === "rule-with-channels");

    const email = rule.channels.find((c) => c.type === "email");
    expect(email.config.smtp_host).toBe("smtp.example.com");
    expect(email.config.smtp_pass).toBe(MASK);
    for (const sample of CHANNEL_TYPES) {
      expect(rules.text).not.toContain(sample.secret);
    }
  });

  for (const role of ["readonly", "editor"]) {
    it(`never shows a channel config to ${role}`, async () => {
      const channels = await app.api(role, "GET", "/api/alerts/channels");
      const rules = await app.api(role, "GET", "/api/alerts/rules");
      for (const channel of channels.json)
        expect(channel.config).toBeUndefined();
      for (const rule of rules.json) {
        for (const channel of rule.channels)
          expect(channel.config).toBeUndefined();
      }
      expect(channels.text).not.toContain("smtp.example.com");
      expect(rules.text).not.toContain("smtp.example.com");
    });

    it(`refuses channel changes from ${role}`, async () => {
      const id = channelIds.email;
      const create = await app.api(role, "POST", "/api/alerts/channels", {
        name: "x",
        type: "email",
        config: {},
      });
      const update = await app.api(role, "PUT", `/api/alerts/channels/${id}`, {
        name: "x",
      });
      const remove = await app.api(
        role,
        "DELETE",
        `/api/alerts/channels/${id}`,
      );
      const test = await app.api(
        role,
        "POST",
        `/api/alerts/channels/${id}/test`,
      );
      expect([
        create.status,
        update.status,
        remove.status,
        test.status,
      ]).toEqual([403, 403, 403, 403]);
    });
  }
});

describe("editing a channel (C4)", () => {
  for (const sample of CHANNEL_TYPES) {
    it(`keeps the ${sample.type} secret when the form sends back the mask`, async () => {
      const id = channelIds[sample.type];
      const list = await app.api("superadmin", "GET", "/api/alerts/channels");
      const listed = list.json.find((c) => c.id === id);
      const maskedConfig =
        typeof listed.config === "string"
          ? JSON.parse(listed.config)
          : listed.config;

      const updated = await app.api(
        "superadmin",
        "PUT",
        `/api/alerts/channels/${id}`,
        {
          name: `renamed-${sample.type}`,
          type: sample.type,
          config: maskedConfig,
        },
      );
      expect(updated.status).toBe(200);

      const stored = JSON.parse(readChannelRow(id).config);
      expect(decrypt(stored[sample.secretField])).toBe(sample.secret);
    });
  }

  it("keeps the secret when the request has no type", async () => {
    const id = channelIds.slack;
    await app.api("superadmin", "PUT", `/api/alerts/channels/${id}`, {
      config: { channel: "#ops-2", bot_token: MASK },
    });
    const stored = JSON.parse(readChannelRow(id).config);
    expect(stored.channel).toBe("#ops-2");
    expect(decrypt(stored.bot_token)).toBe("xoxb-token");
  });

  it("stores and encrypts a new secret", async () => {
    const id = channelIds.email;
    await app.api("superadmin", "PUT", `/api/alerts/channels/${id}`, {
      type: "email",
      config: {
        smtp_host: "smtp.example.com",
        to: "ops@example.com",
        smtp_pass: "new-pass",
      },
    });
    const stored = JSON.parse(readChannelRow(id).config);
    expect(stored.smtp_pass).not.toBe("new-pass");
    expect(decrypt(stored.smtp_pass)).toBe("new-pass");
  });

  it("returns 404 for a channel that does not exist", async () => {
    const result = await app.api(
      "superadmin",
      "PUT",
      "/api/alerts/channels/999999",
      { name: "x" },
    );
    expect(result.status).toBe(404);
  });
});