import express from "express";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { generateSql } from "../servicesAI/SQLGenerationService.js";
import { normaliseTables, resolveContext, fail } from "./aiRouteHelpers.js";

const router = express.Router();

router.post(
  "/generate",
  rateLimiter(60, 60, (req) => `ai-generate:${req.user?.username}`),
  async (req, res) => {
    try {
      const {
        chatId = null,
        instruction,
        tables,
        clusterId = null,
        node = null,
        previousInstruction = null,
        previousSql = null,
        forceRefreshDdl = false,
      } = req.body || {};

      if (!instruction || !String(instruction).trim()) {
        return res.status(422).json({ error: "An instruction is required." });
      }

      const normalisedTables = normaliseTables(tables);
      if (normalisedTables.length === 0) {
        return res.status(422).json({ error: "A tables array is required." });
      }

      const result = await generateSql({
        jti: req.user?.jti,
        context: resolveContext(req),
        appUser: req.user?.username,
        chatId,
        clusterId,
        node,
        tables: normalisedTables,
        instruction: String(instruction).trim(),
        previousInstruction,
        previousSql,
        forceRefreshDdl: !!forceRefreshDdl,
      });

      res.json(result);
    } catch (e) {
      fail(res, e);
    }
  },
);

export default router;