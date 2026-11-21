// Prepares the CHOps backend for a recording: signs in, adds the fake cluster,
// and adds some app data, so the pages are not empty.
import { ADMIN_PASSWORD, ADMIN_USER, BACKEND_URL } from "./settings.js";

// One port for each node of the fake ClickHouse.
const FAKE_PORTS = (process.env.VISUAL_FAKE_PORTS || "8123,8124,8125").split(",").map(Number);
// Each data set has its own cluster in CHOps.
const CLUSTER_NAMES = { normal: "prod-eu", stress: "analytics-eu-west-1-production-cluster-primary" };

async function callApi(token, method, path, body) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

// Each port of the fake ClickHouse is one node. hostName() gives its name.
async function readNodeName(port) {
  const response = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: "SELECT hostName()" });
  return (await response.text()).trim();
}

export async function setUpBackend(dataset) {
  if (!ADMIN_PASSWORD) throw new Error("Set VISUAL_ADMIN_PASSWORD to the password of the CHOps super admin.");
  const login = await callApi(null, "POST", "/api/auth", { username: ADMIN_USER, password: ADMIN_PASSWORD });
  if (login.status !== 200 || !login.data.token) {
    throw new Error(`Sign-in failed: ${JSON.stringify(login.data).slice(0, 200)}`);
  }
  const token = login.data.token;

  const clusters = await callApi(token, "GET", "/api/cluster");
  const clusterList = Array.isArray(clusters.data) ? clusters.data : clusters.data?.clusters || [];
  const clusterName = CLUSTER_NAMES[dataset];
  let cluster = clusterList.find((item) => item.name === clusterName);
  if (!cluster) {
    const nodes = [];
    for (const port of FAKE_PORTS) {
      nodes.push({ name: await readNodeName(port), host: "127.0.0.1", port, user: "default", password: "" });
    }
    const created = await callApi(token, "POST", "/api/cluster", { name: clusterName, nodes });
    if (!created.data?.id) throw new Error(`Could not add the cluster: ${JSON.stringify(created.data).slice(0, 300)}`);
    cluster = created.data;
  }

  await addAppData(token, dataset);
  return { session: login.data, clusterId: cluster.id, nodeName: cluster.nodes[0].name };
}

// Users and a notification channel. A repeat run gets "already exists", which is fine.
async function addAppData(token, dataset) {
  const userCount = dataset === "stress" ? 40 : 4;
  const roles = ["admin", "editor", "readonly", "editor"];
  for (let index = 0; index < userCount; index++) {
    const username = dataset === "stress" ? `reporting_service_account_${String(index).padStart(2, "0")}` : ["priya", "analyst", "grafana", "ravi"][index];
    await callApi(token, "POST", "/api/users", { username, email: `${username}@example.com`, role: roles[index % roles.length] });
  }
  await callApi(token, "POST", "/api/alerts/channels", {
    name: "dba-email", type: "email", config: { recipients: "dba@example.com" }, enabled: true,
  });
}
