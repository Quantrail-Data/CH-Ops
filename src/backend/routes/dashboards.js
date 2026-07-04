// dashboards.js - Custom dashboards and charts REST API
//
// GET endpoints for listing dashboards, charts, and dashboard-
// specific charts. POST/PUT/DELETE require editor or above.
// Charts are standalone entities that can be added to any
// dashboard. GET /:id/charts returns all charts for a dashboard.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from 'express';
import { requireEditor } from '../controllers/users.js';
import { listDashboards, createDashboard, updateDashboard, deleteDashboard, getDashboardCharts, listCharts, createChart, updateChart, deleteChart } from '../controllers/dashboards.js';

const router = Router();
router.get('/', listDashboards);
router.post('/', requireEditor, createDashboard);
router.put('/:id', requireEditor, updateDashboard);
router.delete('/:id', requireEditor, deleteDashboard);
router.get('/:id/charts', getDashboardCharts);
router.get('/charts', listCharts);
router.post('/charts', requireEditor, createChart);
router.put('/charts/:id', requireEditor, updateChart);
router.delete('/charts/:id', requireEditor, deleteChart);
export default router;
