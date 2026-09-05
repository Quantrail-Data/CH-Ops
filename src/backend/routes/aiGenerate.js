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
    let {
      chatId = null,
      instruction,
      tables,
      clusterId = null,
      node = null,
      previousInstruction = null,
      previousSql = null,
      forceRefreshDdl = false,
      title = "",
      messageId = null,
      isApiConfigured = false,
    } = req.body || {};


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

      chatId = chat?.id;

      if (!chatId) {
        return res.status(500).json({
          error: "Failed to create chat.",
        });
      }
    }
    try {
      const isFindChatId = await ChatStore.getChat(req.user?.username, chatId);

      if (!isFindChatId) {
        return res.status(409).json({
          error: "An chatID is invalid.",
        });
      }

      if (!isApiConfigured) {
        const error = {
          code: 422,
          message: "No Api key configured yet",
        };

        const result = await ChatStore.insertError(
          req.user?.username,
          chatId,
          messageId,
          error,
          instruction,
        );

        return res.json({
          ...result,
          chatId,
        });
      }

      if (!instruction || !String(instruction).trim()) {
        const error = {
          code: 422,
          message: "An instruction is required.",
        };

        const result = await ChatStore.insertError(
          req.user?.username,
          chatId,
          messageId,
          error,
          instruction,
        );

        return res.json({
          ...result,
          chatId,
        });
      }

      const normalisedTables = normaliseTables(tables);

      if (normalisedTables.length === 0) {
        const error = {
          code: 422,
          message: "A tables array is required.",
        };

        const result = await ChatStore.insertError(
          req.user?.username,
          chatId,
          messageId,
          error,
          instruction,
        );

        return res.json({
          ...result,
          chatId,
        });
      }

      const result = await generateSql({
        jti: req.user?.jti,
        context: resolveContext(req),
        appUser: req.user?.username,
        chatId: isFindChatId.id,
        clusterId,
        node,
        tables: normalisedTables,
        instruction: String(instruction).trim(),
        previousInstruction,
        previousSql,
        forceRefreshDdl: !!forceRefreshDdl,
        messageId,
      });

      return res.json(result);
    } catch (e) {

      const error = {
        code: 500,
        message: e.message,
      };

      const result = await ChatStore.insertError(
        req.user?.username,
        chatId,
        messageId,
        error,
        instruction,
      );


      return res.json({
        ...result,
        chatId,
      });
    }
  },
);
export default router;