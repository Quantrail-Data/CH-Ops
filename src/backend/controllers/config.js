// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// API endpoint serving authenticated cluster configurations with decrypted passwords for frontend navigation dropdowns.


import { getAllClusters } from '../services/clusterUtils.js';

export function getConnection(req, res) {
  const clusters = getAllClusters();
  res.json({ clusters });
}
