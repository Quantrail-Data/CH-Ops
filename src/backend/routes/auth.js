// auth.js - Authentication REST API
//
// POST / handles login with username/password. POST /change-password
// allows authenticated users to update their own password. Both
// endpoints are rate-limited at the app level. Login failures are
// tracked per username for temporary account lockout.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { login, changePassword, logout } from '../controllers/auth.js';

const router = Router();

router.post('/', login);
router.post('/logout', logout);
router.post('/change-password', changePassword);

export default router;
