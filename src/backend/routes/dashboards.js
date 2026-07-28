// dashboards.js - Custom dashboards and charts REST API
//
// GET endpoints for listing dashboards, charts, and dashboard-
// specific charts. POST/PUT require editor or above; DELETE requires admin.
// Charts are standalone entities that can be added to any
// dashboard. GET /:id/charts returns all charts for a dashboard.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { requireAdmin, requireEditor } from '../controllers/users.js';
import { listDashboards, createDashboard, updateDashboard, deleteDashboard, getDashboardCharts, listCharts, createChart, updateChart, deleteChart } from '../controllers/dashboards.js';

// Editors may create and edit; only admins may delete. Deleting a dashboard
// detaches every chart on it and deleting a chart is unrecoverable, so those
// two sit a level above the rest. This also brings the API in line with the
// UI, which already gated its delete controls on admin while the route
// accepted any editor.
const router = Router();
router.get('/', listDashboards);
router.post('/', requireEditor, createDashboard);
router.put('/:id', requireEditor, updateDashboard);
router.delete('/:id', requireAdmin, deleteDashboard);
router.get('/:id/charts', getDashboardCharts);
router.get('/charts', listCharts);
router.post('/charts', requireEditor, createChart);
router.put('/charts/:id', requireEditor, updateChart);
router.delete('/charts/:id', requireAdmin, deleteChart);
export default router;
