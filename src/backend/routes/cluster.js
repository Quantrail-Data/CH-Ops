// cluster.js - Cluster and node management REST API
//
// GET / returns all clusters with decrypted node credentials.
// POST/PUT/DELETE require admin or superadmin. POST /test
// validates connection credentials against a ClickHouse node
// without saving them. Used during cluster setup to verify
// host, port, user, and password are correct.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { listClusters, createCluster, updateCluster, deleteCluster, testConnection } from '../controllers/cluster.js';
import { requireAdmin } from '../controllers/users.js';

const router = Router();
router.get('/', listClusters);
router.post('/', requireAdmin, createCluster);
router.put('/:id', requireAdmin, updateCluster);
router.delete('/:id', requireAdmin, deleteCluster);
router.post('/test', testConnection);
export default router;
