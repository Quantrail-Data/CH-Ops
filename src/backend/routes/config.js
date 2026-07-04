// config.js - Configuration REST API
//
// GET /connection returns the currently active cluster and node
// connection details. Used by the frontend to initialize the
// connection state on page load. All authenticated users can
// access this endpoint.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { getConnection } from '../controllers/config.js';

const router = Router();
router.get('/connection', getConnection);
export default router;
