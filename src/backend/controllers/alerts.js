// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Controller managing alert rule lifecycles, evaluating thresholds, and triggering notification dispatches.

import { eq, desc } from "drizzle-orm";
import {
  db,
  alertRules,
  alertChannels,
  alertRuleChannels,
} from "../db/index.js";
import { testChannel as testChannelService } from "../services/notifier.js";
import {
  notifyBeforeRuleDisabled,
  validateCronExpression,
} from "../services/alertScheduler.js";
import { alertEvents } from "../db/schema.js";
import { decrypt, encrypt } from "../services/crypto.js";

const _DEFAULTPASSWORDVALUE = "*"?.repeat(15);

function rulesWithChannels(where, req) {
  const rules = where
    ? db
        .select()
        .from(alertRules)
        .where(where)
        .orderBy(desc(alertRules.createdAt))
        .all()
    : db.select().from(alertRules).orderBy(desc(alertRules.createdAt)).all();

  const role = req?.user?.role;
  const isAdmin = role === "superadmin" || role === "admin";

  return rules.map((rule) => {
    const links = db
      .select()
      .from(alertRuleChannels)
      .where(eq(alertRuleChannels.alertRuleId, rule.id))
      .all();
    const channels = links
      .map((l) => {
        const ch = db
          .select()
          .from(alertChannels)
          .where(eq(alertChannels.id, l.alertChannelId))
          .get();
        if (ch && !isAdmin) {
          return { id: ch.id, name: ch.name, type: ch.type };
        }
        if (ch) {
          try {
            ch.config = DummyPaassword(JSON.parse(ch.config), ch.type);
          } catch {
            ch.config = {};
          }
        }
        return ch;
      })
      .filter(Boolean);
    return {
      ...rule,
      channels,
      nodes: rule.nodes ? JSON.parse(rule.nodes) : null,
      cluster_id: rule.clusterId || null,
    };
  });
}

function EncryptValuesChannels(req) {
  const { config, type } = req?.body;
  if (!config || !type) return null;
  let value = null;
  try {
    value = typeof config === "string" ? JSON.parse(config) : config;
  } catch (err) {
    console.log(err?.message);
    return null;
  }
  switch (type) {
    case "email":
      value = { ...value, smtp_pass: encrypt(value?.smtp_pass) };
      break;
    case "slack":
      value = { ...value, bot_token: encrypt(value?.bot_token) };
      break;
    case "google_chat":
      value = { ...value, webhook_url: encrypt(value?.webhook_url) };
      break;
    case "teams":
      value = { ...value, webhook_url: encrypt(value?.webhook_url) };
      break;
    case "pagerduty":
      value = { ...value, routing_key: encrypt(value?.routing_key) };
      break;
    default:
      value = { ...value, smtp_pass: encrypt(value?.smtp_pass) };
      break;
  }

  return value;
}

export function DecryptValuesChannels(config, type) {
  if (!config) return {};
  const parsedConfig = typeof config === "string" ? JSON.parse(config) : config;
  let value = { ...parsedConfig };
  switch (type) {
    case "email":
      value = { ...value, smtp_pass: decrypt(value?.smtp_pass) };
      break;
    case "slack":
      value = { ...value, bot_token: decrypt(value?.bot_token) };
      break;
    case "google_chat":
      value = { ...value, webhook_url: decrypt(value?.webhook_url) };
      break;
    case "teams":
      value = { ...value, webhook_url: decrypt(value?.webhook_url) };
      break;
    case "pagerduty":
      value = { ...value, routing_key: decrypt(value?.routing_key) };
      break;
    default:
      value = { ...value, smtp_pass: decrypt(value?.smtp_pass) };
      break;
  }

  return value;
}

function DummyPaassword(config, type) {
  if (!config) return {};
  let value = { ...config };
  switch (type) {
    case "email":
      value = { ...value, smtp_pass: _DEFAULTPASSWORDVALUE };
      break;
    case "slack":
      value = { ...value, bot_token: _DEFAULTPASSWORDVALUE };
      break;
    case "google_chat":
      value = { ...value, webhook_url: _DEFAULTPASSWORDVALUE };
      break;
    case "teams":
      value = { ...value, webhook_url: _DEFAULTPASSWORDVALUE };
      break;
    case "pagerduty":
      value = { ...value, routing_key: _DEFAULTPASSWORDVALUE };
      break;
    default:
      value = { ...value, smtp_pass: _DEFAULTPASSWORDVALUE };
      break;
  }
  return value;
}

function secretFieldFor(type) {
  if (type === "slack") return "bot_token";
  if (type === "google_chat" || type === "teams") return "webhook_url";
  if (type === "pagerduty") return "routing_key";
  return "smtp_pass";
}

function UpdateKeysValuesChannels(config, type, storedConfig) {
  if (!config) return {};
  const newConfig = typeof config === "string" ? JSON.parse(config) : config;
  const oldConfig =
    typeof storedConfig === "string"
      ? JSON.parse(storedConfig)
      : storedConfig || {};
  const secretField = secretFieldFor(type);
  const value = { ...newConfig };

  if (newConfig[secretField] === _DEFAULTPASSWORDVALUE) {
    value[secretField] = oldConfig[secretField];
  } else {
    value[secretField] = encrypt(newConfig[secretField]);
  }
  return value;
}

// Rules

export function listRules(req, res) {
  res.json(rulesWithChannels(undefined, req));
}

export function listActiveRules(req, res) {
  const all = rulesWithChannels(eq(alertRules.enabled, true), req);
  const active = all.filter((r) => r.isActive === true || r.isActive === 1);
  res.json(active);
}

export function createRule(req, res) {
  const {
    name,
    description,
    sql,
    threshold,
    operator,
    severity,
    schedule,
    enabled,
    channel_ids,
    nodes,
    cluster_id,
    notifyIntervalMinutes,
    breachRunsRequired,
    noRowsMeansBreach,
  } = req.body;
  try {
    const cronError = validateCronExpression(schedule || "*/5 * * * *");
    if (cronError) return res.status(400).json({ error: cronError });
    const result = db
      .insert(alertRules)
      .values({
        name,
        description: description || null,
        sql,
        threshold: threshold ?? 0,
        operator: operator || "gt",
        severity: severity || "warning",
        schedule: schedule || "*/5 * * * *",
        enabled: enabled !== false,
        nodes:
          Array.isArray(nodes) && nodes.length > 0
            ? JSON.stringify(nodes)
            : null,
        clusterId: cluster_id || null,
        notifyIntervalMinutes: notifyIntervalMinutes,
        breachRunsRequired: breachRunsRequired,
        noRowsMeansBreach: noRowsMeansBreach,
      })
      .returning()
      .get();

    if (channel_ids?.length) {
      for (const cid of channel_ids) {
        db.insert(alertRuleChannels)
          .values({ alertRuleId: result.id, alertChannelId: cid })
          .run();
      }
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export async function updateRule(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { schedule } = req?.body;
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid alert rule ID" });
    }

    if (req.body.schedule !== undefined) {
      const cronError = validateCronExpression(req.body.schedule);
      if (cronError) return res.status(400).json({ error: cronError });
    }

    const currentRule = db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .get();

    if (!currentRule) {
      return res.status(404).json({ error: "Alert rule not found" });
    }

    const updates = {};
    for (const k of [
      "name",
      "description",
      "sql",
      "threshold",
      "operator",
      "severity",
      "schedule",
      "notifyIntervalMinutes",
      "breachRunsRequired",
      "noRowsMeansBreach",
    ]) {
      if (req.body[k] !== undefined) {
        updates[k] = req.body[k];
      }
    }

    if (
      req.body.enabled === false &&
      currentRule.enabled &&
      currentRule.lastState === "firing"
    ) {
      await notifyBeforeRuleDisabled(id);
    }

    if (req.body.enabled !== undefined) {
      updates.enabled = req.body.enabled;
    }

    if (req.body.nodes !== undefined) {
      updates.nodes =
        Array.isArray(req.body.nodes) && req.body.nodes.length > 0
          ? JSON.stringify(req.body.nodes)
          : null;
    }
    if (req.body.cluster_id !== undefined) {
      updates.clusterId = req.body.cluster_id || null;
    }

    if (Object.keys(updates).length > 0) {
      db.update(alertRules).set(updates).where(eq(alertRules.id, id)).run();
    }

    if (req.body.channel_ids !== undefined) {
      db.delete(alertRuleChannels)
        .where(eq(alertRuleChannels.alertRuleId, id))
        .run();

      for (const cid of req.body.channel_ids) {
        db.insert(alertRuleChannels)
          .values({
            alertRuleId: id,
            alertChannelId: cid,
          })
          .run();
      }
    }

    const rule = db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .get();

    return res.json(rule);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export function deleteRule(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    db.delete(alertRuleChannels)
      .where(eq(alertRuleChannels.alertRuleId, id))
      .run();
    db.delete(alertRules).where(eq(alertRules.id, id)).run();

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}

// Channels

export function listChannels(req, res) {
  const channels = db
    .select()
    .from(alertChannels)
    .orderBy(alertChannels.name)
    .all();

  // config holds webhook URLs / SMTP credentials. Non-admins only need
  // id/name/type to assign a channel to a rule, not the secret payload.
  const role = req.user?.role;
  const isAdmin = role === "superadmin" || role === "admin";
  res.json(
    channels.map((ch) => {
      if (!isAdmin) return { id: ch.id, name: ch.name, type: ch.type };
      try {
        const convert = JSON.parse(ch.config);
        ch.config = DummyPaassword(convert, ch?.type);
      } catch {
        ch.config = {};
      }
      return ch;
    }),
  );
}

export function createChannel(req, res) {
  try {
    const _encryptValue = EncryptValuesChannels(req);
    const result = db
      .insert(alertChannels)
      .values({
        name: req.body.name,
        type: req.body.type,
        config: JSON.stringify(_encryptValue || {}),
        enabled: req.body.enabled !== false,
      })
      .returning()
      .get();
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function updateChannel(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, id))
      .get();
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.config !== undefined)
      updates.config = JSON.stringify(
        UpdateKeysValuesChannels(
          req.body.config,
          req.body.type ?? existing.type,
          existing.config,
        ),
      );
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;

    db.update(alertChannels).set(updates).where(eq(alertChannels.id, id)).run();
    const ch = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, id))
      .get();
    res.json(ch);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function deleteChannel(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    db.delete(alertRuleChannels)
      .where(eq(alertRuleChannels.alertChannelId, id))
      .run();
    db.delete(alertChannels).where(eq(alertChannels.id, id)).run();

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export async function testChannel(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const ch = db
      .select()
      .from(alertChannels)
      .where(eq(alertChannels.id, id))
      .get();
    if (!ch) return res.status(404).json({ error: "Not found" });

    let cfgObj = {};
    try {
      cfgObj =
        typeof ch.config === "string" ? JSON.parse(ch.config) : ch.config || {};
    } catch {
      cfgObj = {};
    }

    const parsed = { type: ch.type, ...cfgObj };
    const _decryptConfig = DecryptValuesChannels(parsed, ch?.type);
    await testChannelService(_decryptConfig);

    db.update(alertChannels)
      .set({
        lastTestAt: new Date().toISOString(),
        lastTestOk: true,
        lastTestError: null,
      })
      .where(eq(alertChannels.id, id))
      .run();

    res.json({ ok: true });
  } catch (err) {
    const id = parseInt(req.params.id, 10);
    if (!isNaN(id)) {
      try {
        db.update(alertChannels)
          .set({
            lastTestAt: new Date().toISOString(),
            lastTestOk: false,
            lastTestError: err.message || "Unknown error",
          })
          .where(eq(alertChannels.id, id))
          .run();
      } catch {}
    }
    res.json({ ok: false, error: err.message });
  }
}

export function listRuleEvents(req, res) {
  const id = parseInt(req.params.id, 10);
  const rows = db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.alertRuleId, id))
    .orderBy(desc(alertEvents.createdAt))
    .limit(200)
    .all();
  res.json(rows);
}
