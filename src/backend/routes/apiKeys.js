// apiKeys.js - API key management REST API for AI integrations
//
// Full CRUD for API keys used by Qurioz AI and other services.
// Keys are encrypted at rest. Only one key can be active at a time.
// GET /active returns the currently selected key for service use.
// GET /with-values decrypts and returns full keys (admin-only).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from "express";
import {
  getAllApiKeys,
  getApiKeysWithValues,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  setActiveApiKey,
  getActiveApiKey,
  getApiKeyById,
} from "../services/apiKeys.js";
import { requireSuperAdmin } from "../controllers/users.js";
import AIServices from "../servicesAI/AIService.js";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "../services/crypto.js";

const router = Router();

const AIProviderTesting = async (providerID = null,apikey=null) => {
  try {
    if (!providerID && apikey) {
      const {name, apiKey, model} = apikey;
      const AISer = new AIServices(
      name,
      model,
      apiKey,
    );
    const response = await AISer?.ask("hi");
    return response
      ? { success: true, message: "active" }
      : { success: false, message: "failed" };
    }

    const findAPIKEY = db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys?.id, providerID))
      .get();
    if (!findAPIKEY) {
      throw new Error("API KEY not founded!");
    }
    const AISer = new AIServices(
      findAPIKEY?.name,
      findAPIKEY?.model,
      decrypt(findAPIKEY?.encryptedKey),
    );

    const response = await AISer?.ask("hi");

    return response
      ? { success: true, message: "active" }
      : { success: false, message: "failed" };
  } catch (error) {
    console.error("API key validation failed:", error.message);
    // Surface the classified message (rate limit / auth failure / etc. from
    // AIService.ask()) instead of a generic "failed" - the caller can't tell
    // an invalid key apart from a rate-limited valid one otherwise.
    return { success: false, message: error.message || "failed" };
  }
};

router.get("/", (req, res) => {
  try {
    const keys = getAllApiKeys();
    const activeKey = getActiveApiKey();
    res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/value", requireSuperAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const key = getApiKeyById(id);
    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }
    res.json({ keyValue: key.key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/active", (req, res) => {
  try {
    const activeKey = getActiveApiKey();
    if (!activeKey) {
      return res.status(404).json({ error: "No active API key found" });
    }
    // Only the AI provider name/model is needed client-side to show connection
    // status; the decrypted key itself is used exclusively server-side (see
    // SQLGenerationService) and must never reach the browser.
    const { key, ...safeKey } = activeKey;
    res.json({ apiKey: safeKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/with-values", requireSuperAdmin, (req, res) => {
  try {
    const keys = getApiKeysWithValues();
    const activeKey = getActiveApiKey();
    res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireSuperAdmin, (req, res) => {
  try {
    const { name, apiKey, model } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: "API key name required." });
    }
    if (!apiKey?.trim()) {
      return res.status(400).json({ error: "API key value required." });
    }
    if (!model?.trim()) {
      return res.status(400).json({ error: "API key model required." });
    }
    const newKey = createApiKey(name, apiKey, model);
    res.status(201).json(newKey);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requireSuperAdmin, (req, res) => {
  try {
    const { name, apiKey, model } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: "API key name required." });
    }
    if (!apiKey?.trim()) {
      return res.status(400).json({ error: "API key value required." });
    }

    if (!model?.trim()) {
      return res.status(400).json({ error: "API key model required." });
    }
    const id = parseInt(req.params.id);
    const updated = updateApiKey(id, name, apiKey, model);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireSuperAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    deleteApiKey(id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/select", requireSuperAdmin, (req, res) => {
  try {
    const { keyId } = req.body;
    if (!keyId) {
      return res.status(400).json({ error: "Key ID required." });
    }
    const active = setActiveApiKey(parseInt(keyId));
    res.json(active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/check",async (req,res,next)=>{
  try {
    const {apiKeys} = req.body;
    if (!apiKeys) return res.status(422).json({success:false,message:"Provider ID and Model details  must be included!"});

    const responseTesting = await AIProviderTesting(null,apiKeys);

    return res.status(201)?.json(responseTesting);
  }
  catch(error) {
    console.error("API key check route error:", error.message);
    next(error);
  }
})

router.post("/ollama/models", async (req, res) => {
  try {
    const { baseUrl } = req.body;
    if (!baseUrl?.trim()) {
      return res.status(422).json({ success: false, message: "Base URL is required." });
    }

    let parsed;
    try {
      parsed = new URL(baseUrl.trim());
    } catch {
      return res.status(422).json({ success: false, message: "Enter a valid URL, e.g. http://localhost:11434" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(422).json({ success: false, message: "URL must start with http:// or https://" });
    }

    const tagsUrl = `${baseUrl.trim().replace(/\/+$/, "")}/api/tags`;
    let response;
    try {
      response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
    } catch {
      // Server not running yet, wrong port, DNS failure, timeout - an expected
      // state during setup, not a server error.
      return res.status(200).json({
        success: false,
        message: `Could not reach Ollama at ${baseUrl.trim()}. Make sure the server is running and the base URL is correct.`,
      });
    }
    if (!response.ok) {
      return res.status(200).json({ success: false, message: `Ollama responded with HTTP ${response.status}.` });
    }

    const data = await response.json().catch(() => null);
    const models = Array.isArray(data?.models) ? data.models.map((m) => m.name).filter(Boolean) : [];
    return res.status(200).json({ success: true, models });
  } catch (error) {
    console.error("Ollama model listing error:", error.message);
    return res.status(200).json({ success: false, message: "Failed to fetch Ollama models." });
  }
});

export default router;
