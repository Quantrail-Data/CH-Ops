// apiKeys.js - API key management REST API for AI integrations
//
// Full CRUD for API keys used by Qurioz AI and other services.
// Keys are encrypted at rest. Only one key can be active at a time.
// GET /active returns the currently selected key for service use.
// GET /with-values decrypts and returns full keys (admin-only).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { 
  getAllApiKeys, 
  getApiKeysWithValues, 
  createApiKey, 
  updateApiKey, 
  deleteApiKey, 
  setActiveApiKey,
  getActiveApiKey,
  getApiKeyById
} from '../services/apiKeys.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const keys = getAllApiKeys();
    const activeKey = getActiveApiKey();
    res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/value', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const key = getApiKeyById(id);
    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.json({ keyValue: key.key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/active', (req, res) => {
  try {
    const activeKey = getActiveApiKey();
    if (!activeKey) {
      return res.status(404).json({ error: 'No active API key found' });
    }
    res.json({ apiKey: activeKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/with-values', (req, res) => {
  try {
    const keys = getApiKeysWithValues();
    const activeKey = getActiveApiKey();
    res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, apiKey,model } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'API key name required.' });
    }
    if (!apiKey?.trim()) {
      return res.status(400).json({ error: 'API key value required.' });
    }
    if (!model?.trim()) {
      return res.status(400).json({ error: 'API key model required.' });
    }
    const newKey = createApiKey(name, apiKey,model);
    res.status(201).json(newKey);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, apiKey ,model} = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'API key name required.' });
    }
    if (!apiKey?.trim()) {
      return res.status(400).json({ error: 'API key value required.' });
    }

    if (!model?.trim()) {
      return res.status(400).json({ error: 'API key model required.' });
    }
    const id = parseInt(req.params.id);
    const updated = updateApiKey(id, name,apiKey,model);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    deleteApiKey(id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/select', (req, res) => {
  try {
    const { keyId } = req.body;
    if (!keyId) {
      return res.status(400).json({ error: 'Key ID required.' });
    }
    const active = setActiveApiKey(parseInt(keyId));
    res.json(active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;