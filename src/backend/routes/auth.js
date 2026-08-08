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
import { rateLimit } from 'express-rate-limit';
import { login, changePassword, logout } from '../controllers/auth.js';


const router = Router();
router.post('/', rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: true,
}), login);
router.post('/logout', rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: true,
}), logout);
router.post('/change-password', rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: true,
}), changePassword);

export default router;
