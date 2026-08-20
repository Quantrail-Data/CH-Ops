// appConfig.js - routes for the App Config page.
// Contributors - Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { Router } from 'express';
import { requireAdmin } from '../controllers/users.js';
import { getAppConfig, putAppConfig, deleteAppConfig } from '../controllers/appConfig.js';

const router = Router();

router.get('/', requireAdmin, getAppConfig);
router.put('/', requireAdmin, putAppConfig);
router.delete('/:key', requireAdmin, deleteAppConfig);

export default router;