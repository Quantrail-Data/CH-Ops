// Contributors -> Kathir Moorthy, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Classifies Kubernetes API, TLS and network failures into messages a person can act on.

export const K8S_ERROR = {
  UNREACHABLE: 'K8S_UNREACHABLE',
  CERT_UNTRUSTED: 'K8S_CERT_UNTRUSTED',
  CERT_HOSTNAME: 'K8S_CERT_HOSTNAME',
  UNAUTHORIZED: 'K8S_UNAUTHORIZED',
  FORBIDDEN: 'K8S_FORBIDDEN',
  OPERATOR_MISSING: 'K8S_OPERATOR_MISSING',
  NOT_FOUND: 'K8S_NOT_FOUND',
  THROTTLED: 'K8S_THROTTLED',
  SERVER_ERROR: 'K8S_SERVER_ERROR',
  UNKNOWN: 'K8S_UNKNOWN',
};

export class K8sError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'K8sError';
    this.code = code;
    this.details = details;
  }
}

// Substrings that appear in TLS failures.
const CERT_UNTRUSTED_HINTS = [
  'self-signed certificate',
  'self signed certificate',
  'unable to verify',
  'unable_to_verify',
  'certificate signed by unknown authority',
  'UNABLE_TO_GET_ISSUER_CERT',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_UNTRUSTED',
];

const CERT_HOSTNAME_HINTS = [
  'hostname/ip does not match',
  'does not match certificate',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'altname',
];

const UNREACHABLE_HINTS = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'connection refused',
  'connection closed',
  'failed to connect',
  'unable to connect',
];

function includesAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

// Classify a thrown network or TLS error, before any HTTP response exists.
export function classifyTransportError(err, context = {}) {
  const raw = [err?.message, err?.cause?.message, err?.code, err?.cause?.code]
    .filter(Boolean)
    .join(' ');

  // Hostname is checked first: some stacks report both, and it is the more specific and more actionable diagnosis.
  if (includesAny(raw, CERT_HOSTNAME_HINTS)) {
    return new K8sError(
      K8S_ERROR.CERT_HOSTNAME,
      'The certificate does not cover this address. Use exactly the server address from your kubeconfig, not an alias such as localhost.',
      { raw, ...context },
    );
  }

  if (includesAny(raw, CERT_UNTRUSTED_HINTS)) {
    return new K8sError(
      K8S_ERROR.CERT_UNTRUSTED,
      'The CA certificate does not match this server. Re-copy it from your kubeconfig and try again.',
      { raw, ...context },
    );
  }

  if (includesAny(raw, UNREACHABLE_HINTS)) {
    return new K8sError(
      K8S_ERROR.UNREACHABLE,
      'Cannot reach the Kubernetes API. Check the address, and whether this cluster restricts API access to specific IP ranges.',
      { raw, ...context },
    );
  }

  return new K8sError(
    K8S_ERROR.UNKNOWN,
    'The connection to Kubernetes failed for an unrecognised reason.',
    { raw, ...context },
  );
}

// Classify a completed HTTP response that carried a non-2xx status.
export function classifyResponseError(status, body, context = {}) {
  const reason = body?.reason || '';
  const serverMessage = body?.message || '';

  if (status === 401) {
    return new K8sError(
      K8S_ERROR.UNAUTHORIZED,
      'The token was rejected. It may have been revoked or deleted. Re-run the setup script to issue a new one.',
      { status, serverMessage, ...context },
    );
  }

  if (status === 403) {
    const what = context.resource
      ? `${context.verb || 'read'} ${context.resource}`
      : 'perform this action';
    const where = context.namespace ? ` in namespace ${context.namespace}` : '';
    return new K8sError(
      K8S_ERROR.FORBIDDEN,
      `This token cannot ${what}${where}. Grant the missing permission or use the wider setup script.`,
      { status, serverMessage, ...context },
    );
  }

  if (status === 404) {
    // A 404 on a custom resource path means the CRD is absent
    if (context.isCustomResource) {
      return new K8sError(
        K8S_ERROR.OPERATOR_MISSING,
        'No Altinity® Kubernetes Operator for ClickHouse® was found in this cluster. CHOps needs the operator installed to discover ClickHouse® installations.',
        { status, serverMessage, ...context },
      );
    }
    return new K8sError(
      K8S_ERROR.NOT_FOUND,
      serverMessage || 'The requested object does not exist.',
      { status, serverMessage, ...context },
    );
  }

  if (status === 429) {
    return new K8sError(
      K8S_ERROR.THROTTLED,
      'The Kubernetes API is throttling requests. CHOps will retry shortly.',
      { status, serverMessage, ...context },
    );
  }

  if (status >= 500) {
    return new K8sError(
      K8S_ERROR.SERVER_ERROR,
      'The Kubernetes API server returned an error. This is a problem on the cluster side, not with CHOps.',
      { status, serverMessage, reason, ...context },
    );
  }

  return new K8sError(
    K8S_ERROR.UNKNOWN,
    serverMessage || `Unexpected response from the Kubernetes API (HTTP ${status}).`,
    { status, serverMessage, reason, ...context },
  );
}

// True when the caller should retry after a delay.
export function isRetryable(err) {
  return err instanceof K8sError && err.code === K8S_ERROR.THROTTLED;
}
