// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> kathir Moorthy, Praveen kumar
// config.js - configuration REST API routes

import { Router } from 'express';
import { getConnection, getCapabilities } from '../controllers/config.js';

const router = Router();
router.get('/connection', getConnection);
router.get('/capabilities/:clusterId', getCapabilities);
export default router;
