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

function rulesWithChannels(where) {
  const rules = where
    ? db
        .select()
        .from(alertRules)
        .where(where)
        .orderBy(desc(alertRules.createdAt))
        .all()
    : db.select().from(alertRules).orderBy(desc(alertRules.createdAt)).all();

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
        if (ch) {
          try {
            ch.config = JSON.parse(ch.config);
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

// Rules

export function listRules(req, res) {
  res.json(rulesWithChannels());
}

export function listActiveRules(req, res) {
  const all = rulesWithChannels(eq(alertRules.enabled, true));
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
  } = req.body;
  try {
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

export function updateRule(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = {};
    for (const k of [
      "name",
      "description",
      "sql",
      "threshold",
      "operator",
      "severity",
      "schedule",
    ]) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
    if (req.body.nodes !== undefined) {
      updates.nodes =
        Array.isArray(req.body.nodes) && req.body.nodes.length > 0
          ? JSON.stringify(req.body.nodes)
          : null;
    }
    if (req.body.cluster_id !== undefined) {
      updates.clusterId = req.body.cluster_id || null;
    }

    db.update(alertRules).set(updates).where(eq(alertRules.id, id)).run();

    if (req.body.channel_ids !== undefined) {
      db.delete(alertRuleChannels)
        .where(eq(alertRuleChannels.alertRuleId, id))
        .run();
      for (const cid of req.body.channel_ids) {
        db.insert(alertRuleChannels)
          .values({ alertRuleId: id, alertChannelId: cid })
          .run();
      }
    }
    const rule = db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .get();
    res.json(rule);
  } catch (error) {
    res.status(500).json(error.message);
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
        ch.config = JSON.parse(ch.config);
      } catch {
        ch.config = {};
      }
      return ch;
    }),
  );
}

export function createChannel(req, res) {
  try {
    const result = db
      .insert(alertChannels)
      .values({
        name: req.body.name,
        type: req.body.type,
        config: JSON.stringify(
          typeof req.body.config === "string"
            ? JSON.parse(req.body.config)
            : req.body.config || {},
        ),
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
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.config !== undefined)
      updates.config = JSON.stringify(
        typeof req.body.config === "string"
          ? JSON.parse(req.body.config)
          : req.body.config,
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
    await testChannelService(parsed);

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
