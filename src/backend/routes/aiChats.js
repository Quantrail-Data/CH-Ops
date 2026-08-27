import express from "express";
import * as ChatStore from "../servicesAI/chatStore.js";
import { TITLE_MAX_CHARS } from "../servicesAI/constants.js";
import {normaliseTables,fail, notFound} from "./aiRouteHelpers.js"
const router = express.Router();

function chatId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(422).json({ error: "A numeric chat id is required." });
    return null;
  }
  return id;
}

router.get("/chats", async (req, res) => {
  try {
    res.json({ chats: await ChatStore.listChats(req.user?.username) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/chats", async (req, res) => {
  try {
    const {
      title,
      instruction,
      clusterId = null,
      node = null,
      selectedTables,
    } = req.body || {};

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
      selectedTables: normaliseTables(selectedTables),
    });
    res.status(201).json({ chat });
  } catch (e) {
    fail(res, e);
  }
});

router.get("/chats/:id", async (req, res) => {
  try {
    const id = chatId(req, res);
    if (id === null) return;

    const chat = await ChatStore.getChat(req.user?.username, id);
    if (!chat) return notFound(res);

    res.json({
      chat,
      messages: await ChatStore.listMessages(req.user?.username, id),
    });
  } catch (e) {
    fail(res, e);
  }
});

router.patch("/chats/:id", async (req, res) => {
  try {
    const id = chatId(req, res);
    if (id === null) return;

    // Only the keys present in the body are touched; ChatStore whitelists them
    // again, so appUser cannot be reassigned from here.
    const patch = {};
    if ("title" in req.body) patch.title = req.body.title;
    if ("clusterId" in req.body) patch.clusterId = req.body.clusterId;
    if ("node" in req.body) patch.node = req.body.node;
    if ("selectedTables" in req.body) {
      patch.selectedTables = normaliseTables(req.body.selectedTables);
    }

    const chat = await ChatStore.updateChat(req.user?.username, id, patch);
    if (!chat) return notFound(res);

    res.json({ chat });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/chats/:id", async (req, res) => {
  try {
    const id = chatId(req, res);
    if (id === null) return;

    const deleted = await ChatStore.deleteChat(req.user?.username, id);
    if (!deleted) return notFound(res);

    res.json({ deleted: true, id });
  } catch (e) {
    fail(res, e);
  }
});

export default router;