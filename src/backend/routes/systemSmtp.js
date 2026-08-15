// systemSmtp.js - routes for the system SMTP settings.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { Router } from 'express';
import { requireSuperAdminOnly } from '../controllers/users.js';
import {
  getSystemSmtp,
  putSystemSmtp,
  removeSystemSmtp,
  testSystemSmtpConnection,
  sendSystemSmtpTestEmail,
} from '../controllers/systemSmtp.js';

const router = Router();

// Superadmin on every route: these settings hold a password.
router.get('/', requireSuperAdminOnly, getSystemSmtp);
router.put('/', requireSuperAdminOnly, putSystemSmtp);
router.delete('/', requireSuperAdminOnly, removeSystemSmtp);
router.post('/test-connection', requireSuperAdminOnly, testSystemSmtpConnection);
router.post('/test-email', requireSuperAdminOnly, sendSystemSmtpTestEmail);

export default router;