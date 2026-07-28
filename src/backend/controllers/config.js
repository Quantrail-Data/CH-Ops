// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// API endpoint serving authenticated cluster configurations for frontend
// navigation dropdowns. Node passwords are masked: the browser never receives
// a ClickHouse® credential. The backend resolves the stored password from the
// cluster configuration when it runs a query.

import { getAllClusters, maskClusterPasswords } from '../services/clusterUtils.js';

export function getConnection(req, res) {
  res.json({ clusters: getAllClusters().map(maskClusterPasswords) });
}
