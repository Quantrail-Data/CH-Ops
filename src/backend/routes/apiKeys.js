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
import { requireSuperAdmin } from "../controllers/users.js";
import { createAPIKey, deleteAPIKey, getActiveAPIKey, getAPIKeyById, getAPIKeys, getAPIKeysWithValues, getOllamaModels, setActiveAPIKey, testAPIKey, updateAPIKey } from "../controllers/apikeys.js";

const router = Router();


router.get("/", getAPIKeys);

router.get("/:id/value", requireSuperAdmin, getAPIKeyById);

router.get("/active", requireSuperAdmin, getActiveAPIKey);

router.get("/with-values", requireSuperAdmin, getAPIKeysWithValues);

router.post("/", requireSuperAdmin, createAPIKey);

router.put("/:id", requireSuperAdmin, updateAPIKey);

router.delete("/:id", requireSuperAdmin, deleteAPIKey);

router.post("/select", requireSuperAdmin, setActiveAPIKey);

router.post("/check", requireSuperAdmin, testAPIKey)

router.post("/ollama/models", requireSuperAdmin, getOllamaModels);

export default router;
