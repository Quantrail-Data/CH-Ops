// users.js - User management REST API
//
// GET / lists all users with their roles. POST / creates a new user
// (admin/superadmin only). PUT /:id updates user role or password
// with internal RBAC checks - you can't modify users at or above
// your own role level. DELETE /:id removes a user with the same
// privilege restrictions.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { requireAdmin, listUsers, createUser, updateUser, deleteUser } from '../controllers/users.js';

const router = Router();
router.get('/', listUsers);
router.post('/', requireAdmin, createUser);
router.put('/:id', updateUser);           // has internal RBAC checks for role changes
router.delete('/:id', requireAdmin, deleteUser);
export default router;
