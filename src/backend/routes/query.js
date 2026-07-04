// query.js - SQL execution REST API
//
// POST / executes SQL against ClickHouse using the current
// connection credentials. Body limited to 100KB to prevent
// oversized payloads. POST /test-connection validates connection
// credentials without executing arbitrary SQL. Both endpoints
// are rate-limited to prevent abuse.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { runQuery, testQueryConnection } from '../controllers/query.js';

const router = Router();
router.post('/', runQuery);
router.post('/test-connection', testQueryConnection);
export default router;
