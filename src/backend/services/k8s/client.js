// Read-only Kubernetes API client with central pagination, retry and TLS handling.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathirdhasan, Kathir Moorthy

import {
  K8sError,
  K8S_ERROR,
  classifyTransportError,
  classifyResponseError,
  isRetryable,
} from './errors.js';

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const MAX_PAGES = 100; // guard against a server that never stops paginating

// Media type that asks the API server to render the same columns kubectl prints
export const TABLE_ACCEPT =
  'application/json;as=Table;g=meta.k8s.io;v=v1,application/json';

// Media type that returns names, labels and annotations only.
export const METADATA_ACCEPT =
  'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1,application/json';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry-After is either seconds or an HTTP date.
function retryDelayMs(response, attempt) {
  const header = response?.headers?.get?.('retry-after');
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
  return Math.min(500 * 2 ** attempt, 8000);
}

// Create a client bound to one cluster connection.
export function createK8sClient({
  apiAddress,
  caCertificate,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!apiAddress) throw new Error('apiAddress is required');
  if (!caCertificate) throw new Error('caCertificate is required');
  if (!token) throw new Error('token is required');
  let base = apiAddress;
  while (base.endsWith('/')) {
    base = base.slice(0, -1);
  }

  async function request(path, { method = 'GET', accept, query, signal, context = {} } = {}) {
    // Disallow absolute URLs in path to prevent request forgery / SSRF.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(path || ''))) {
      throw new Error('Invalid request path');
    }
    const url = new URL(String(path || ''), base);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: accept || 'application/json',
      'Accept-Encoding': 'gzip',
    };

    let attempt = 0;
    for (; ;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abortSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      let response;
      try {
        response = await fetch(url.toString(), {
          method,
          headers,
          signal: abortSignal,
          // Bun-specific: supplies the cluster CA and leaves verification on.
          tls: { ca: caCertificate },
        });
      } catch (err) {
        clearTimeout(timer);
        throw classifyTransportError(err, { url: url.pathname, ...context });
      }
      clearTimeout(timer);

      if (response.ok) return response;

      let body = null;
      try {
        body = await response.json();
      } catch {
        // Non-JSON error body.
      }

      const error = classifyResponseError(response.status, body, {
        url: url.pathname,
        ...context,
      });

      if (isRetryable(error) && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(response, attempt));
        attempt += 1;
        continue;
      }
      throw error;
    }
  }

  // Single object read.
  async function get(path, options = {}) {
    const response = await request(path, options);
    return response.json();
  }

  // One page of a collection.
  async function listPage(path, { limit = DEFAULT_PAGE_SIZE, cont, ...options } = {}) {
    const response = await request(path, {
      ...options,
      query: { ...(options.query || {}), limit, continue: cont },
    });
    return response.json();
  }

  // Read an entire collection, following the continuation cursor.
  async function listAll(path, options = {}) {
    const items = [];
    let cont;
    let pages = 0;

    do {
      const page = await listPage(path, { ...options, cont });
      if (Array.isArray(page?.items)) items.push(...page.items);
      cont = page?.metadata?.continue || undefined;
      pages += 1;

      if (pages >= MAX_PAGES && cont) {
        throw new K8sError(
          K8S_ERROR.SERVER_ERROR,
          `Stopped after ${MAX_PAGES} pages while listing ${path}. The result set is unexpectedly large.`,
          { path },
        );
      }
    } while (cont);

    return items;
  }

  // POST, used only for SelfSubjectRulesReview.
  async function post(path, payload, options = {}) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(path || ''))) {
      throw new Error('Invalid request path');
    }
    const url = new URL(String(path || ''), base);
    let response;
    try {
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        tls: { ca: caCertificate },
      });
    } catch (err) {
      throw classifyTransportError(err, { url: url.pathname, ...(options.context || {}) });
    }

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch { /* non-JSON error body */ }
      throw classifyResponseError(response.status, body, {
        url: url.pathname,
        ...(options.context || {}),
      });
    }
    return response.json();
  }

  // Streaming read, used for pod logs.
  async function stream(path, options = {}) {
    const response = await request(path, { ...options, accept: '*/*' });
    return response.body;
  }

  return { get, listPage, listAll, post, stream, baseUrl: base };
}

// Path builders Core

export const paths = {
  namespaces: () => '/api/v1/namespaces',

  pods: (ns) => `/api/v1/namespaces/${ns}/pods`,
  podLog: (ns, pod) => `/api/v1/namespaces/${ns}/pods/${pod}/log`,
  pvcs: (ns) => `/api/v1/namespaces/${ns}/persistentvolumeclaims`,
  services: (ns) => `/api/v1/namespaces/${ns}/services`,
  configMaps: (ns) => `/api/v1/namespaces/${ns}/configmaps`,
  events: (ns) => `/api/v1/namespaces/${ns}/events`,
  resourceQuotas: (ns) => `/api/v1/namespaces/${ns}/resourcequotas`,

  // EndpointSlice replaces the core Endpoints API, which is deprecated from Kubernetes 1.33.
  endpointSlices: (ns) => `/apis/discovery.k8s.io/v1/namespaces/${ns}/endpointslices`,

  statefulSets: (ns) => `/apis/apps/v1/namespaces/${ns}/statefulsets`,
  networkPolicies: (ns) => `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies`,
  ingresses: (ns) => `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`,
  podDisruptionBudgets: (ns) => `/apis/policy/v1/namespaces/${ns}/poddisruptionbudgets`,

  storageClasses: () => '/apis/storage.k8s.io/v1/storageclasses',

  selfSubjectRulesReviews: () =>
    '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',

  installations: (ns) =>
    `/apis/clickhouse.altinity.com/v1/namespaces/${ns}/clickhouseinstallations`,
  installation: (ns, name) =>
    `/apis/clickhouse.altinity.com/v1/namespaces/${ns}/clickhouseinstallations/${name}`,
  keeperInstallations: (ns) =>
    `/apis/clickhouse-keeper.altinity.com/v1/namespaces/${ns}/clickhousekeeperinstallations`,
};

// Label selector helpers.
export const selectors = {
  ownedByInstallation: (name) => `clickhouse.altinity.com/chi=${name}`,
  keeperOwnedBy: (name) => `clickhouse-keeper.altinity.com/chk=${name}`,
  slicesForService: (serviceName) => `kubernetes.io/service-name=${serviceName}`,
};
