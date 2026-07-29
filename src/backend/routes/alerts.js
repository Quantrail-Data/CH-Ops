// alerts.js - Alert rules and channels REST API
//
// GET endpoints are accessible to all authenticated users (readonly
// can view alerts). POST/PUT/DELETE require admin or superadmin since
// alert SQL executes on cluster nodes and channels contain webhook URLs.
// Test channel endpoint validates email/webhook configurations.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { requireAdmin } from '../controllers/users.js';
import { listRules, listActiveRules, createRule, updateRule, deleteRule, listChannels, createChannel, updateChannel, deleteChannel, testChannel } from '../controllers/alerts.js';

const router = Router();
router.get('/rules', listRules);
router.get('/rules/active', listActiveRules);
router.get('/channels', listChannels);
router.post('/rules', requireAdmin, createRule);
router.put('/rules/:id', requireAdmin, updateRule);
router.delete('/rules/:id', requireAdmin, deleteRule);
router.post('/channels', requireAdmin, createChannel);
router.put('/channels/:id', requireAdmin, updateChannel);
router.delete('/channels/:id', requireAdmin, deleteChannel);
router.post('/channels/:id/test', requireAdmin, testChannel);
export default router;
