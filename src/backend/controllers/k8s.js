// Copyright (C) 2026 Quantrail™ Data Private Limited
// Kubernetes connection, discovery and installation import endpoints.
// Contributors -> Kathir Moorthy, Praveen kumar

import {
  listConnections,
  getConnection,
  saveConnection,
  deleteConnection,
  providerFor,
  readInstallationHosts,
  readInstallationAddresses,
  testConnection as runConnectionTest,
  OPERATORS,
  ADDRESSING,
  RESOLUTION,
} from "../services/k8sConnections.js";
import {
  getAllClusters,
  saveClusters,
  MAX_CLUSTERS,
} from "../services/clusterUtils.js";
import { clearCapabilities } from "../services/capabilities.js";
import { createTemplateRulesForCluster } from "../services/alertTemplates.js";
import { log } from "../services/logger.js";
import { executeQuery } from "../services/clickhouse.js";
import { redact } from "./k8sInsight.js";

// A K8sError carries a message written for a person.
function fail(res, err) {
  const isK8s = typeof err?.code === "string" && err.code.startsWith("K8S_");
  const message = isK8s ? err.message : "The request could not be completed.";
  const status = err?.code === "K8S_FORBIDDEN" ? 403 : 502;
  return res.status(status).json({ error: message, code: err?.code ?? null });
}

// Kubernetes names are lowercase letters, digits, "-" and ".".
// Without "/" a name stays one path segment and cannot reach another API path.
function isValidKubernetesName(value) {
  return (
    typeof value === "string" &&
    value.length <= 253 &&
    /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(value)
  );
}

// GET /api/k8s/operators
export function listOperators(req, res) {
  return res.json({ operators: Object.values(OPERATORS) });
}

// GET /api/k8s/connections
export function listK8sConnections(req, res) {
  try {
    return res.json(listConnections());
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

// POST /api/k8s/connections
export function createK8sConnection(req, res) {
  const {
    name,
    apiAddress,
    caCertificate,
    token,
    namespaces,
    operatorNamespace,
  } = req.body || {};

  if (!name?.trim())
    return res.status(400).json({ error: "A name is required." });
  const operatorNamespaceText = String(operatorNamespace || "").trim();
  if (operatorNamespaceText && !isValidKubernetesName(operatorNamespaceText)) {
    return res
      .status(400)
      .json({ error: "The operator namespace is not valid." });
  }
  if (!apiAddress?.trim())
    return res.status(400).json({ error: "An API address is required." });
  if (!caCertificate?.trim()) {
    return res.status(400).json({ error: "A CA certificate is required." });
  }
  if (!token?.trim())
    return res.status(400).json({ error: "A token is required." });
  if (!/^https:\/\//i.test(apiAddress.trim())) {
    return res
      .status(400)
      .json({ error: "The API address must start with https://" });
  }

  try {
    const id = saveConnection({
      name: name.trim(),
      apiAddress: apiAddress.trim(),
      caCertificate: caCertificate.trim(),
      token: token.trim(),
      namespaces,
      operatorNamespace: operatorNamespaceText || null,
    });
    return res.status(201).json({ id });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

// PUT /api/k8s/connections/:id
export function updateK8sConnection(req, res) {
  const { id } = req.params;
  const existing = getConnection(id);
  if (!existing)
    return res.status(404).json({ error: "Connection not found." });

  const {
    name,
    apiAddress,
    caCertificate,
    token,
    namespaces,
    operatorNamespace,
  } = req.body || {};

  // undefined keeps the stored operator namespace. An empty text clears it.
  const operatorNamespaceText =
    operatorNamespace === undefined
      ? undefined
      : String(operatorNamespace || "").trim();
  if (operatorNamespaceText && !isValidKubernetesName(operatorNamespaceText)) {
    return res
      .status(400)
      .json({ error: "The operator namespace is not valid." });
  }

  try {
    saveConnection({
      id,
      name: name?.trim() || existing.name,
      apiAddress: apiAddress?.trim() || existing.apiAddress,
      // Absent certificate or token means keep the stored one.
      caCertificate: caCertificate?.trim() || undefined,
      token: token?.trim() || undefined,
      namespaces: namespaces ?? existing.namespaces,
      operatorNamespace: operatorNamespaceText,
    });
    return res.json({ ok: true });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

// DELETE /api/k8s/connections/:id
export function deleteK8sConnection(req, res) {
  const { id } = req.params;

  // Refuse while a cluster still depends on it, rather than leaving that cluster pointing at nothing.
  const dependent = getAllClusters().filter((c) => c.k8s?.connectionId === id);
  if (dependent.length) {
    return res.status(409).json({
      error: `This connection is used by ${dependent.length} cluster(s). Remove them first.`,
      clusters: dependent.map((c) => c.name),
    });
  }

  try {
    deleteConnection(id);
    return res.json({ deleted: true });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

// POST /api/k8s/test
export async function testK8sConnection(req, res) {
  const { apiAddress, caCertificate, token, namespace, connectionId } =
    req.body || {};

  // The namespace is optional here, but must be a real name when given.
  if (namespace && !isValidKubernetesName(namespace)) {
    return res.status(400).json({ error: "The namespace is not valid." });
  }

  try {
    // Testing a stored connection re-uses its token rather than asking the caller to send it again.
    if (connectionId) {
      const stored = getConnection(connectionId, { includeToken: true });
      if (!stored)
        return res.status(404).json({ error: "Connection not found." });
      return res.json(
        await runConnectionTest({
          apiAddress: stored.apiAddress,
          caCertificate: stored.caCertificate,
          token: stored.token,
          namespace,
        }),
      );
    }

    if (!apiAddress || !caCertificate || !token) {
      return res
        .status(400)
        .json({ error: "Address, certificate and token are required." });
    }

    return res.json(
      await runConnectionTest({ apiAddress, caCertificate, token, namespace }),
    );
  } catch (err) {
    return fail(res, err);
  }
}

// POST /api/k8s/operator-probe: checks that the operator pod can be seen in a namespace.
export async function probeOperatorPod(req, res) {
  const { connectionId, operatorNamespace } = req.body || {};
  if (!connectionId) {
    return res.status(400).json({ error: "A connection is required." });
  }
  if (!isValidKubernetesName(operatorNamespace)) {
    return res
      .status(400)
      .json({ error: "A valid operator namespace is required." });
  }

  try {
    let operator = "akoc";
    let operatorPod = await providerFor(connectionId, "akoc").provider.getOperatorPod(
      operatorNamespace,
    );
    if (!operatorPod) {
      operator = "ocko";
      operatorPod = await providerFor(connectionId, "ocko").provider.getOperatorPod(
        operatorNamespace,
      );
    }

    if (!operatorPod) {
      return res.json({
        found: false,
        message: `No operator pod was found in ${operatorNamespace}. Check the namespace. The token may also lack read access to pods there.`,
      });
    }
    return res.json({
      found: true,
      operator,
      podName: operatorPod.podName,
      container: operatorPod.container,
    });
  } catch (err) {
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/namespaces
export async function listNamespaces(req, res) {
  try {
    const { provider, connection } = providerFor(req.params.id);

    // An explicit allowlist avoids asking the cluster, and works without list permission.
    if (connection.namespaces?.length) {
      return res.json({
        namespaces: connection.namespaces,
        source: "allowlist",
      });
    }

    return res.json({
      namespaces: await provider.listNamespaces(),
      source: "cluster",
    });
  } catch (err) {
    if (err?.code === "K8S_FORBIDDEN") {
      // Expected with a namespace-scoped token.
      return res.json({ namespaces: [], source: "restricted" });
    }
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/installations?namespace=
export async function listInstallations(req, res) {
  const { namespace } = req.query;
  if (!isValidKubernetesName(namespace)) {
    return res.status(400).json({ error: "A valid namespace is required." });
  }

  try {
    const { provider } = providerFor(req.params.id, req.query.operator);
    return res.json({
      installations: await provider.listInstallations(namespace),
    });
  } catch (err) {
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/installations/:name?namespace=
export async function getInstallation(req, res) {
  const { namespace } = req.query;
  if (!isValidKubernetesName(namespace)) {
    return res.status(400).json({ error: "A valid namespace is required." });
  }
  if (!isValidKubernetesName(req.params.name)) {
    return res
      .status(400)
      .json({ error: "A valid installation name is required." });
  }

  try {
    const { provider } = providerFor(req.params.id, req.query.operator);
    const detail = await provider.getInstallation(namespace, req.params.name);
    // Same redaction as the Configuration tab: specs often hold passwords.
    return res.json({
      ...detail,
      spec: redact(detail.spec),
      normalized: redact(detail.normalized),
      unmanaged: provider.isUnmanaged(detail),
    });
  } catch (err) {
    return fail(res, err);
  }
}

// Try the ClickHouse® credentials against the endpoint the user gave.
async function checkClickHouseCredentials({
  host,
  port,
  secure,
  user,
  password,
}) {
  try {
    const result = await executeQuery({
      host,
      port,
      secure,
      user,
      password,
      readOnly: true,
      timeoutMs: 10000,
      sql: "SELECT version() AS version",
    });
    return { ok: true, version: result?.rows?.[0]?.version ?? null };
  } catch (err) {
    const raw = String(err?.message ?? "");
    const lower = raw.toLowerCase();

    // Authentication rejected.
    if (
      lower.includes("authentication failed") ||
      lower.includes("password is incorrect") ||
      lower.includes("unknown user") ||
      lower.includes("access denied") ||
      lower.includes("code: 516") ||
      lower.includes("code: 192")
    ) {
      return {
        ok: false,
        reason: "auth",
        message:
          user === "default"
            ? "ClickHouse® rejected these credentials. The default user is often restricted to the cluster's own pods, so it cannot connect from outside even with the right password. Create a dedicated user instead."
            : "ClickHouse® rejected these credentials.",
        detail: raw,
      };
    }

    if (
      lower.includes("econnrefused") ||
      lower.includes("etimedout") ||
      lower.includes("enotfound") ||
      lower.includes("ehostunreach") ||
      lower.includes("network")
    ) {
      return {
        ok: false,
        reason: "unreachable",
        message:
          "The address could not be reached. Addresses Kubernetes uses internally do not resolve from outside the cluster, so this needs a load balancer, an ingress or a port forward.",
        detail: raw,
      };
    }

    return {
      ok: false,
      reason: "unknown",
      message: "ClickHouse® did not answer.",
      detail: raw,
    };
  }
}

// POST /api/k8s/import Creates a CHOps cluster from an installation.
export async function importInstallation(req, res) {
  const {
    connectionId,
    namespace,
    installation,
    operator = "akoc",
    displayName,
    endpoint,
    port,
    secure,
    chUser,
    chPassword,
    acknowledgeCredentialFailure = false,
    addressingMode = ADDRESSING.AUTO,
    acknowledgeSharedEndpoint = false,
  } = req.body || {};

  if (!OPERATORS[operator]) {
    return res.status(400).json({ error: "Unknown operator." });
  }

  if (!connectionId || !namespace || !installation) {
    return res.status(400).json({
      error: "A connection, namespace and installation are required.",
    });
  }
  if (
    !isValidKubernetesName(namespace) ||
    !isValidKubernetesName(installation)
  ) {
    return res.status(400).json({
      error: "The namespace or installation is not a valid Kubernetes name.",
    });
  }
  if (!endpoint?.trim()) {
    return res.status(400).json({
      error:
        "A reachable ClickHouse address is required. Internal cluster addresses do not resolve from outside the cluster.",
    });
  }

  const existing = getAllClusters();
  if (existing.length >= MAX_CLUSTERS) {
    return res.status(400).json({
      error: `Maximum ${MAX_CLUSTERS} clusters allowed. Remove one before adding another.`,
    });
  }

  const duplicate = existing.find(
    (c) =>
      c.k8s?.namespace === namespace && c.k8s?.installation === installation,
  );
  if (duplicate) {
    return res.status(409).json({
      error: `${installation} in ${namespace} has already been added as "${duplicate.name}".`,
    });
  }

  // The display name defaults to the installation name, so two namespaces can collide.
  const proposedName = (displayName?.trim() || installation).toLowerCase();
  const nameClash = existing.find(
    (c) => c.name.trim().toLowerCase() === proposedName,
  );
  if (nameClash) {
    return res.status(409).json({
      error: `A cluster named "${nameClash.name}" already exists. Give this one a different display name.`,
    });
  }

  try {
    const resolvedPort = port || 8443;
    const resolvedSecure = secure !== false;
    const addressing = await readInstallationAddresses({
      connectionId,
      namespace,
      installation,
      operator,
      endpoint: endpoint.trim(),
      port: resolvedPort,
      secure: resolvedSecure,
      user: chUser || "default",
      password: chPassword || "",
      mode: addressingMode,
    });

    const nodes = addressing.nodes;
    if (!nodes.length) {
      return res.status(400).json({
        error:
          "That installation reported no hosts. It may not have finished starting.",
      });
    }

    // Checked before anything is written.
    const credentials = await checkClickHouseCredentials({
      host: endpoint.trim(),
      port: resolvedPort,
      secure: resolvedSecure,
      user: chUser || "default",
      password: chPassword || "",
    });

    if (!credentials.ok && !acknowledgeCredentialFailure) {
      // Not an error status.
      return res.json({
        needsConfirmation: true,
        credentialCheck: credentials,
        hosts: nodes.length,
      });
    }

    if (!addressing.perNodeAccurate && !acknowledgeSharedEndpoint) {
      return res.json({
        needsSharedEndpointConfirmation: true,
        resolution: addressing.resolution,
        hosts: nodes.length,
        endpoint: endpoint.trim(),
      });
    }

    const cluster = {
      id: `k8s_${namespace}_${installation}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      name: displayName?.trim() || installation,
      kind: "k8s",
      chUser: chUser || "default",
      chPassword: chPassword || "",
      port: resolvedPort,
      secure: resolvedSecure,
      k8s: { connectionId, namespace, installation, operator },
      endpoint: endpoint.trim(),
      // The endpoint is the address queries actually go to.
      nodes,
      k8sAddressing: {
        mode: addressingMode,
        resolution: addressing.resolution,
        perNodeAccurate: addressing.perNodeAccurate,
      },
    };

    try {
      saveClusters([...existing, cluster]);
    } catch (err) {
      // A name collision or the cluster cap.
      return res.status(400).json({ error: err.message });
    }
    clearCapabilities(cluster.id);
    // The cluster is saved. A template problem must not fail the import.
    try {
      createTemplateRulesForCluster(cluster.id);
    } catch (error) {
      log.error("Could not add the alert template rules", {
        error: error.message,
      });
    }
    return res.status(201).json({
      id: cluster.id,
      hosts: nodes.length,
      // Carried back so the interface can say what is unavailable until this is fixed.
      credentialCheck: credentials,
    });
  } catch (err) {
    return fail(res, err);
  }
}

export async function verifyClusterConnection(req, res) {
  const { endpoint, port, secure, chUser, chPassword, clusterId } =
    req.body || {};

  if (!endpoint?.trim()) {
    return res.status(400).json({ error: "ClickHouse address is required." });
  }

  let password = chPassword;
  // Blank means keep the stored one, so test with that rather than an empty
  // string, which would fail for a reason the user did not cause.
  if (!password && clusterId) {
    const existing = getAllClusters().find((c) => c.id === clusterId);
    password = existing?.chPassword ?? "";
  }

  const result = await checkClickHouseCredentials({
    host: endpoint.trim(),
    port: Number(port) || 8443,
    secure: secure !== false,
    user: chUser || "default",
    password: password || "",
  });

  return res.json(result);
}

// POST /api/k8s/clusters/:id/refresh
export async function refreshCluster(req, res) {
  const cluster = getAllClusters().find((c) => c.id === req.params.id);
  if (!cluster) return res.status(404).json({ error: "Cluster not found." });
  if (cluster.kind !== "k8s") {
    return res
      .status(400)
      .json({ error: "That cluster was not added through Kubernetes." });
  }

  if (!cluster.endpoint) {
    return res.json({
      ok: false,
      message:
        "This cluster has no stored ClickHouse address. Edit it, set the address, and save.",
    });
  }

  try {
    const addressing = await readInstallationAddresses({
      connectionId: cluster.k8s.connectionId,
      namespace: cluster.k8s.namespace,
      installation: cluster.k8s.installation,
      operator: cluster.k8s.operator,
      // The stored ClickHouse address. The first node may have the address of one pod only.
      endpoint: cluster.endpoint,
      port: cluster.port ?? 8443,
      secure: cluster.secure !== false,
      user: cluster.chUser || "default",
      password: cluster.chPassword || "",
      mode: cluster.k8sAddressing?.mode || ADDRESSING.AUTO,
    });

    const previous = cluster.k8sAddressing?.resolution ?? null;

    const updated = {
      ...cluster,
      nodes: addressing.nodes,
      k8sAddressing: {
        ...(cluster.k8sAddressing || {}),
        resolution: addressing.resolution,
        perNodeAccurate: addressing.perNodeAccurate,
      },
    };

    const others = getAllClusters().filter((c) => c.id !== cluster.id);
    saveClusters([...others, updated]);
    if (previous && previous !== addressing.resolution) {
      return res.json({
        hosts: addressing.nodes.length,
        addressingChanged: { from: previous, to: addressing.resolution },
      });
    }

    return res.json({
      ok: true,
      hosts: addressing.nodes.length,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    return fail(res, err);
  }
}

export async function reresolveCluster(req, res) {
  const cluster = getAllClusters().find((c) => c.id === req.params.id);
  if (!cluster) return res.status(404).json({ error: "Cluster not found." });
  if (cluster.kind !== "k8s") return res.json({ ok: true, skipped: true });

  try {
    const addressing = await readInstallationAddresses({
      connectionId: cluster.k8s.connectionId,
      namespace: cluster.k8s.namespace,
      installation: cluster.k8s.installation,
      operator: cluster.k8s.operator,
      endpoint: cluster.endpoint,
      port: cluster.port ?? 8443,
      secure: cluster.secure !== false,
      user: cluster.chUser || "default",
      password: cluster.chPassword || "",
      mode: cluster.k8sAddressing?.mode || ADDRESSING.AUTO,
    });

    const others = getAllClusters().filter((c) => c.id !== cluster.id);
    saveClusters([
      ...others,
      {
        ...cluster,
        nodes: addressing.nodes,
        k8sAddressing: {
          ...(cluster.k8sAddressing || {}),
          resolution: addressing.resolution,
          perNodeAccurate: addressing.perNodeAccurate,
        },
      },
    ]);

    return res.json({
      ok: true,
      hosts: addressing.nodes.length,
      perNodeAccurate: addressing.perNodeAccurate,
    });
  } catch (err) {
    // The cluster was still saved. Report it rather than failing the edit.
    return res.json({ ok: false, message: err.message });
  }
}
