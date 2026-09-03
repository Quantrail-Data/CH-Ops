import express from "express";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { generateSql } from "../servicesAI/SQLGenerationService.js";
import { normaliseTables, resolveContext, fail } from "./aiRouteHelpers.js";
import { TITLE_MAX_CHARS } from "../servicesAI/constants.js";
import * as ChatStore from "../servicesAI/chatStore.js";

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
        title="",
        messageId=null,

      } = req.body || {};

    

      if (!instruction || !String(instruction).trim()) {
        return res.status(422).json({ error: "An instruction is required." });
      }

      const normalisedTables = normaliseTables(tables);

      if (normalisedTables.length === 0) {
        return res.status(422).json({ error: "A tables array is required." });
      }

      if (!chatId) {
        const resolvedTitle =
          (title && String(title).trim()) ||
          String(instruction ?? "")
            .trim()
            .slice(0, TITLE_MAX_CHARS) ||
          null;

        const chat = await ChatStore.createChat(req.user?.username, {
          title: resolvedTitle,
          clusterId,
          node,
          selectedTables: normaliseTables(tables),
        });

        const result = await generateSql({
          jti: req.user?.jti,
          context: resolveContext(req),
          appUser: req.user?.username,
          chatId:chat?.id,
          clusterId,
          node,
          tables: normalisedTables,
          instruction: String(instruction).trim(),
          previousInstruction,
          previousSql,
          forceRefreshDdl: !!forceRefreshDdl,
        });

        return res.json(result);
      }

      const isFindChatId = await ChatStore.getChat(req?.user?.username,chatId)
      
      if (!isFindChatId) return  res.status(409).json({ error: "An chatID is invalid." });

     

      const result = await generateSql({
        jti: req.user?.jti,
        context: resolveContext(req),
        appUser: req.user?.username,
        chatId:isFindChatId?.id,
        clusterId,
        node,
        tables: normalisedTables,
        instruction: String(instruction).trim(),
        previousInstruction,
        previousSql,
        forceRefreshDdl: !!forceRefreshDdl,
        messageId
      });

      return res.json(result);
    } catch (e) {
      console.error(e)
      fail(res, e);
    }
  },
);

export default router;
