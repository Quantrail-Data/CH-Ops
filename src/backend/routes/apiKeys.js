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
import { requireAdmin } from "../controllers/users.js";
import { createAPIKey, deleteAPIKey, getActiveAPIKey, getAPIKeyById, getAPIKeys, getAPIKeysWithValues, getOllamaModels, setActiveAPIKey, testAPIKey, updateAPIKey } from "../controllers/apikeys.js";

const router = Router();


router.get("/", getAPIKeys);

router.get("/:id/value", requireAdmin, getAPIKeyById);

router.get("/active", requireAdmin, getActiveAPIKey);

router.get("/with-values", requireAdmin, getAPIKeysWithValues);

router.post("/", requireAdmin, createAPIKey);

router.put("/:id", requireAdmin, updateAPIKey);

router.delete("/:id", requireAdmin, deleteAPIKey);

router.post("/select", requireAdmin, setActiveAPIKey);

router.post("/check", requireAdmin, testAPIKey);

router.post("/ollama/models", requireAdmin, getOllamaModels);

export default router;
