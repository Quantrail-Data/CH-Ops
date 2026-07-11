// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Handles multi-cluster management (max 3 clusters, 18 nodes total) with admin-restricted CRUD operations.


import {
  getAllClusters,
  saveClusters,
  MAX_CLUSTERS,
  MAX_TOTAL_NODES,
  getClusterById,
  getNodeByName,
} from "../services/clusterUtils.js";
import { executeQuery } from "../services/clickhouse.js";

export function listClusters(req, res) {
  res.json(getAllClusters());
}

export function createCluster(req, res) {

  try {
    const role = req.user?.role;

    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({
        error: "Admin access required.",
      });
    }

    const clusters = getAllClusters();

    if (clusters.length >= MAX_CLUSTERS) {
      return res.status(400).json({
        error: `Maximum ${MAX_CLUSTERS} clusters.`,
      });
    }

    const { name, nodes } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Cluster name required.",
      });
    }

    if (
      clusters.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())
    ) {
      return res.status(400).json({
        error: "Cluster name must be unique.",
      });
    }

    const nodeArr = Array.isArray(nodes) ? nodes : [];

    const err = validateNodes(nodeArr, clusters);

    if (err) {

      return res.status(400).json({
        error: err.message,
      });
    }

    const newCluster = {
      id: `cluster_${Date.now()}`,
      name: name.trim(),
      nodes: nodeArr,
    };

    clusters.push(newCluster);

    saveClusters(clusters);


    return res.status(201).json(newCluster);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}

export function updateCluster(req, res) {
  try {
    const role = req.user?.role;
    if (role !== "superadmin" && role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }

    const clusters = getAllClusters();
    const idx = clusters.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Cluster not found." });
    }

    const { name, nodes } = req.body;
    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ error: "Cluster name required." });
      }
      if (
        clusters.some(
          (c, i) =>
            i !== idx && c.name.toLowerCase() === name.trim().toLowerCase(),
        )
      ) {
        return res.status(400).json({ error: "Cluster name must be unique." });
      }
    }
    clusters[idx].name = name.trim();
    if (nodes !== undefined) {
      const nodeArr = Array.isArray(nodes) ? nodes : [];
      const err = validateNodes(nodeArr, clusters, idx);
      if (err) return res.status(400).json({ error: err });
      clusters[idx].nodes = nodeArr;
    }

    saveClusters(clusters);


    res.json(clusters[idx]);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function deleteCluster(req, res) {
  try {
    const role = req.user?.role;
    if (role !== "superadmin" && role !== "admin")
      return res.status(403).json({ error: "Admin access required." });

    const clusters = getAllClusters();
    const filtered = clusters.filter((c) => c.id !== req.params.id);
    if (filtered.length === clusters.length)
      return res.status(404).json({ error: "Cluster not found." });

    saveClusters(filtered);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export async function testConnection(req, res) {
  const { host, port, user, password, secure } = req.body;
  if (!host) return res.status(400).json({ error: "Host required." });
  try {
    const result = await executeQuery({
      host,
      port: port || 8123,
      user: user || "default",
      password: password || "",
      secure: !!secure,
      sql: "SELECT version() AS version, uptime() AS uptime",
    });

    res.json({
      ok: true,
      version: result.rows?.[0]?.version,
      uptime: result.rows?.[0]?.uptime,
    });
  } catch (err) {
    console.log(err)
    res.status(500).json({ ok: false, error: err.message });
  }
}

function validateNodes(nodes, allClusters, excludeIdx) {
  if (!Array.isArray(nodes)) return null;
  const missing = nodes.find((n) => !n.name?.trim());
  if (missing) return "Node Name is required for all nodes.";
  const names = nodes.map((n) => n.name.trim().toLowerCase());
  if (new Set(names).size !== names.length)
    return "Node names must be unique within a cluster.";

  // Check total node count across all clusters
  const otherNodes = allClusters.reduce(
    (sum, c, i) => sum + (i === excludeIdx ? 0 : c.nodes?.length || 0),
    0,
  );
  if (otherNodes + nodes.length > MAX_TOTAL_NODES)
    return `Maximum ${MAX_TOTAL_NODES} total nodes across all clusters.`;

  return null;
}
