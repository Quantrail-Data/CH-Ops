// aiSchema.js - Qurioz schema discovery and context sizing
//
//   GET  /api/ai/status      - which provider/model will run a generation
//   GET  /api/ai/databases   - databases on the connected cluster
//   GET  /api/ai/tables      - tables in ?databases=a,b
//   POST /api/ai/ddl         - CREATE TABLE for the selected tables (cached)
//   POST /api/ai/estimate    - will this selection fit the model's context?
//
// Every ClickHouse call runs under the caller's own credentials, resolved
// server-side from an encrypted session. The browser never sends a ClickHouse
// password to these routes.
//
// The session context defaults to 'qurioz' (the /qurioz page's own connect
// flow) but a caller may ask for a different one of its own sessions: the SQL
// Editor's GenerateSqlWizard runs these same routes under 'editor', reusing
// the connection already established there rather than asking the user to
// connect twice. This only ever selects among the caller's own (jti-bound)
// sessions - it cannot reach another user's credentials.
//
// Routes here stay thin: DdlService owns the queries and the cache, and
// PromptBuilder/TokenEstimator own the sizing.
//
// Author: Qurioz AI service layer
// Copyright (C) 2026 Quantrail™ Data Private Limited

import express from "express";
import { getAiStatus } from "../services/studioAi.js";
import { CRED_CONTEXTS } from "../services/chCredStore.js";
import * as DdlService from "../servicesAI/DdlService.js";
import { buildPrompt, joinPrompt } from "../servicesAI/PromptBuilder.js";
import { estimateTokens, isOversize, limitKeyFor } from "../servicesAI/TokenEstimator.js";
import { CONTEXT_LIMITS } from "../servicesAI/constants.js";
import {normaliseTables, fail, resolveContext } from "./aiRouteHelpers.js"

const router = express.Router();


// Shared by the routes below: what identifies the caller and where to connect.
// jti comes from the verified token, never the body.
function connectionFor(req) {
  return {
    jti: req.user?.jti,
    context: resolveContext(req),
    clusterId: req.body?.clusterId ?? req.query?.clusterId ?? null,
    node: req.body?.node ?? req.query?.node ?? null,
  };
}


// Which provider and model a generation will use. Never returns the API key.
router.get("/status", (req, res) => {
  try {
    const status = getAiStatus();
    const key = limitKeyFor(status.provider);
    res.json({ ...status, contextLimit: CONTEXT_LIMITS[key]?.default ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/databases", async (req, res) => {
  try {
    res.json({ databases: await DdlService.listDatabases(connectionFor(req)) });
  } catch (e) {
    fail(res, e);
  }
});

// ?databases=a,b - repeated ?databases= params work too.
router.get("/tables", async (req, res) => {
  try {
    const raw = req.query.databases;
    const databases = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
      .map((d) => String(d).trim())
      .filter(Boolean);

    if (databases.length === 0) {
      return res.status(422).json({ error: "A databases query parameter is required." });
    }

    res.json({ tables: await DdlService.listTables({ ...connectionFor(req), databases }) });
  } catch (e) {
    fail(res, e);
  }
});

// { tables, forceRefresh } -> { results, failures }
// A table that cannot be read lands in failures; the rest still come back.
router.post("/ddl", async (req, res) => {
  try {
    const tables = normaliseTables(req.body?.tables);
    if (tables.length === 0) {
      return res.status(422).json({ error: "A tables array is required." });
    }

    const { results, failures } = await DdlService.fetchDdl({
      ...connectionFor(req),
      tables,
      forceRefresh: !!req.body?.forceRefresh,
    });

    res.json({ results, failures });
  } catch (e) {
    fail(res, e);
  }
});

// Estimate the prompt this selection would produce, so the client can warn
// before spending a generation. Uses the real PromptBuilder rather than summing
// DDL lengths, so the number reflects what would actually be sent.
router.post("/estimate", async (req, res) => {
  try {
    const tables = normaliseTables(req.body?.tables);
    if (tables.length === 0) {
      return res.status(422).json({ error: "A tables array is required." });
    }

    const { results, failures } = await DdlService.fetchDdl({
      ...connectionFor(req),
      tables,
      forceRefresh: false,
    });

    const prompt = joinPrompt(
      buildPrompt({
        instruction: req.body?.instruction ?? "",
        ddlBlocks: results,
        previousInstruction: req.body?.previousInstruction ?? null,
        previousSql: req.body?.previousSql ?? null,
      }),
    );

    const status = getAiStatus();
    const tokensEstimated = estimateTokens(prompt.length);

    res.json({
      tokensEstimated,
      charCount: prompt.length,
      provider: status.provider ?? null,
      model: status.model ?? null,
      contextLimit: CONTEXT_LIMITS[limitKeyFor(status.provider)]?.default ?? null,
      oversize: isOversize(tokensEstimated, status.provider),
      tableCount: results.length,
      failures,
    });
  } catch (e) {
    fail(res, e);
  }
});


router.post("/ddl-estimate", async (req, res) => {
  try {
    const tables = normaliseTables(req.body?.tables);
    if (tables.length === 0) {
      return res.status(422).json({ error: "empty",tokensEstimated:0 });
    }
    const { results, failures } = await DdlService.fetchDdl({
      ...connectionFor(req),
      tables,
      forceRefresh: !!req.body?.forceRefresh,
    });
    const prompt = joinPrompt(
      buildPrompt({
        instruction: req.body?.instruction ?? "",
        ddlBlocks: results,
        previousInstruction: req.body?.previousInstruction ?? null,
        previousSql: req.body?.previousSql ?? null,
      }),
    );
    const status = getAiStatus();
    const tokensEstimated = estimateTokens(prompt.length);
    res.json({
      results,
      failures,
      tokensEstimated,
      // charCount: prompt.length,
      // provider: status.provider ?? null,
      // model: status.model ?? null,
      // contextLimit:
      //   CONTEXT_LIMITS[limitKeyFor(status.provider)]?.default ?? null,
      // oversize: isOversize(tokensEstimated, status.provider),
      // tableCount: results.length,
    });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
