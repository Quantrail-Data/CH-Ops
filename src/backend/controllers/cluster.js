// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Handles multi-cluster management (max 3 clusters, 18 nodes total) with admin-restricted CRUD operations.

import {
  getAllClusters,
  saveClusters,
  MAX_CLUSTERS,
  MAX_TOTAL_NODES,
  maskClusterPasswords,
} from "../services/clusterUtils.js";
import { executeQuery } from "../services/clickhouse.js";

export function listClusters(req, res) {
  res.json(getAllClusters().map(maskClusterPasswords));
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

    const err = validateNodes(nodeArr, clusters, undefined, req.body?.kind);

    if (err) {
      return res.status(400).json({
        error: err,
      });
    }

    const newCluster = {
      id: `cluster_${Date.now()}`,
      name: name.trim(),
      nodes: nodeArr,
    };

    clusters.push(newCluster);

    saveClusters(clusters);

    return res.status(201).json(maskClusterPasswords(newCluster));
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
      // Inside the guard: a PUT that sends only `nodes` used to reach
      // name.trim() with name undefined and throw a TypeError, surfacing as a
      // 500 with no useful message.
      clusters[idx].name = name.trim();
    }
    if (nodes !== undefined) {
      // Nodes on a Kubernetes cluster are derived from the installation and rewritten on every
      if (clusters[idx].kind === "k8s") {
        return res.status(400).json({
          error:
            "Nodes on a Kubernetes cluster come from the installation and cannot be edited. Use Refresh to re-read them.",
        });
      }
      const existingNodes = clusters[idx].nodes || [];
      // The client never receives decrypted passwords (see listClusters), so a
      // blank password here means "unchanged" rather than "clear it" - keep the
      // previously stored password for that node.
      //
      // Matched on host:port rather than name. Name is what the user edits, so
      // matching on it meant renaming a node while leaving the password field
      // blank (which the UI tells you to do) silently cleared its password.
      // Host and port identify the same server across a rename.
      const keyOf = (n) => `${n.host}:${n.port || 8123}`;
      const nodeArr = (Array.isArray(nodes) ? nodes : []).map((n) => {
        if (!n.password) {
          const existing =
            existingNodes.find((e) => keyOf(e) === keyOf(n)) ||
            existingNodes.find((e) => e.name === n.name);
          if (existing?.password) return { ...n, password: existing.password };
        }
        return n;
      });
      const err = validateNodes(nodeArr, clusters, idx, clusters[idx].kind);
      if (err) return res.status(400).json({ error: err });
      clusters[idx].nodes = nodeArr;
    }

    saveClusters(clusters);

    res.json(maskClusterPasswords(clusters[idx]));
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function testConnection(req, res) {
  const role = req.user?.role;
  if (role !== "superadmin" && role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const { host, port, user, password, secure } = req.body;
  if (!host) return res.status(400).json({ error: "Host required." });

  const targetPort = port || 8123;

  // A node that is already saved is matched against the stored configuration.
  // Two reasons. The browser no longer holds decrypted passwords, so testing a
  // saved node has to resolve the stored one server-side or it authenticates
  // with a blank password and always fails. And matching bounds this endpoint
  // to hosts an admin has already configured, so it cannot be used to probe
  // arbitrary internal addresses.
  const stored = getAllClusters()
    .flatMap((c) => c.nodes || [])
    .find((n) => n.host === host && (n.port || 8123) === targetPort);

  // An unsaved node is still testable - that is the point of Test before Save -
  // but it must carry its own credentials, and it never reaches the store.
  if (!stored && password === undefined) {
    return res.status(400).json({
      error: "Enter a password to test a node that has not been saved yet.",
    });
  }

  const resolvedUser = user || stored?.user || "default";
  const resolvedPassword =
    password !== undefined && password !== ""
      ? password
      : (stored?.password ?? "");
  const resolvedSecure = secure !== undefined ? !!secure : !!stored?.secure;

  try {
    const result = await executeQuery({
      host,
      port: targetPort,
      user: resolvedUser,
      password: resolvedPassword,
      secure: resolvedSecure,
      sql: "SELECT version() AS version, uptime() AS uptime",
    });

    res.json({
      ok: true,
      version: result.rows?.[0]?.version,
      uptime: result.rows?.[0]?.uptime,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

function validateNodes(nodes, allClusters, excludeIdx, kind) {
  if (!Array.isArray(nodes)) return null;
  if (nodes?.length === 0)
    return `No nodes found. Add at least one node before creating the cluster.`;
  const missing = nodes.find((n) => !n.name?.trim());
  if (missing) return "Node Name is required for all nodes.";
  const names = nodes.map((n) => n.name.trim().toLowerCase());
  if (new Set(names).size !== names.length)
    return "Node names must be unique within a cluster.";

  // Check total node count across all clusters.
  const otherNodes = allClusters.reduce(
    (sum, c, i) =>
      sum + (i === excludeIdx || c.kind === "k8s" ? 0 : c.nodes?.length || 0),
    0,
  );
  if (kind !== "k8s" && otherNodes + nodes.length > MAX_TOTAL_NODES)
    return `Maximum ${MAX_TOTAL_NODES} total nodes across all clusters.`;

  return null;
}
