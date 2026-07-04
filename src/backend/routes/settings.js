// settings.js - Application settings REST API
//
// CRUD operations for key-value settings stored in app_settings.
// Used for storing various configuration: cluster data, backup
// profiles, alert configs, and UI preferences. GET / lists all
// settings, GET /:key retrieves a specific one, PUT creates or
// updates, DELETE removes a setting.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { listSettings, getSetting, upsertSetting, deleteSetting } from '../controllers/settings.js';

const router = Router();
router.get('/', listSettings);
router.get('/:key', getSetting);
router.put('/:key', upsertSetting);
router.delete('/:key', deleteSetting);
export default router;
