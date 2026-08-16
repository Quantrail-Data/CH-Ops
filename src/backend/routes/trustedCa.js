// trustedCa.js - routes for the trusted certificate authorities.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { Router } from 'express';
import { requireAdmin } from '../controllers/users.js';
import {
  getTrustedCas,
  postTrustedCa,
  removeTrustedCa,
  getCaUsage,
} from '../controllers/trustedCa.js';

const router = Router();

// Admin rather than superadmin
router.get('/', requireAdmin, getTrustedCas);
router.post('/', requireAdmin, postTrustedCa);
router.delete('/:id', requireAdmin, removeTrustedCa);
router.get('/:id/usage', requireAdmin, getCaUsage);

export default router;