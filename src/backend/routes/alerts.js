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
import { requireSuperAdmin } from '../controllers/users.js';
import { listRules, listActiveRules, createRule, updateRule, deleteRule, listChannels, createChannel, updateChannel, deleteChannel, testChannel } from '../controllers/alerts.js';

const router = Router();
router.get('/rules', listRules);
router.get('/rules/active', listActiveRules);
router.get('/channels', listChannels);
router.post('/rules', requireSuperAdmin, createRule);
router.put('/rules/:id', requireSuperAdmin, updateRule);
router.delete('/rules/:id', requireSuperAdmin, deleteRule);
router.post('/channels', requireSuperAdmin, createChannel);
router.put('/channels/:id', requireSuperAdmin, updateChannel);
router.delete('/channels/:id', requireSuperAdmin, deleteChannel);
router.post('/channels/:id/test', requireSuperAdmin, testChannel);
export default router;
