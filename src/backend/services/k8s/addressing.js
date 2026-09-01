// addressing.js - works out how CHOps should reach each ClickHouse pod
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G 
// Copyright (C) 2026 Quantrail™ Data Private Limited


import { paths, selectors } from './client.js';
import { executeQuery } from '../clickhouse.js';
import { getConfig } from '../appConfig.js';

export const ADDRESSING = Object.freeze({
 
  AUTO: 'auto',
  
  PER_POD: 'per-pod',
 
  ENDPOINT: 'endpoint',
});


export const RESOLUTION = Object.freeze({
  FQDN: 'fqdn',                 
  PER_POD_SERVICE: 'service',   
  ENDPOINT: 'endpoint',         
});





async function probe({ host, port, secure, user, password }) {
  try {
    await executeQuery({
      host,
      port,
      secure,
      user,
      password,
      readOnly: true,
      sql: 'SELECT 1',
      timeoutMs: getConfig('k8s.probeTimeoutMs'),
    });
    return true;
  } catch {

    return false;
  }
}


export async function findPerPodServices(client, namespace) {
  const services = await client.listAll(paths.services(namespace));


  const external = services.filter(
    (s) => s.spec?.type === 'NodePort' || s.spec?.type === 'LoadBalancer',
  );
  if (!external.length) return new Map();

  const byPod = new Map();

  for (const service of external) {
    const name = service.metadata?.name;
    if (!name) continue;

    let slices;
    try {
      slices = await client.listAll(paths.endpointSlices(namespace), {
        query: { labelSelector: selectors.slicesForService(name) },
      });
    } catch {
   
      continue;
    }


    const pods = new Set();
    for (const slice of slices) {
      for (const endpoint of slice.endpoints ?? []) {
        const podName = endpoint.targetRef?.name;
        if (podName) pods.add(podName);
      }
    }


    if (pods.size !== 1) continue;

    const podName = [...pods][0];
    const address = externalAddressFor(service);
    if (!address) continue;


    if (!byPod.has(podName)) byPod.set(podName, address);
  }

  return byPod;
}


function externalAddressFor(service) {
  const httpPort = (service.spec?.ports ?? []).find(
    (p) => p.port === 8123 || p.port === 8443 || p.name === 'http' || p.name === 'https',
  );
  if (!httpPort) return null;

  if (service.spec?.type === 'LoadBalancer') {
    const ingress = service.status?.loadBalancer?.ingress?.[0];
    const host = ingress?.hostname || ingress?.ip;

    if (!host) return null;
    return { host, port: httpPort.port };
  }

  if (service.spec?.type === 'NodePort' && httpPort.nodePort) {
    return { host: null, port: httpPort.nodePort, needsNodeAddress: true };
  }

  return null;
}


export async function resolveNodeAddresses({
  client,
  namespace,
  nodes,
  endpoint,
  port,
  secure,
  user,
  password,
  mode = ADDRESSING.AUTO,
}) {
  const withEndpoint = () => {
    // Writing an undefined host fails the notNull constraint on cluster_node
    // with an error that names the column and not the cause. Say what is wrong
    // while we still know.
    if (!endpoint) {
      throw new Error(
        'No ClickHouse address is set for this cluster. Edit it and set one, then try again.',
      );
    }
    return {
      resolution: RESOLUTION.ENDPOINT,
      nodes: nodes.map((n) => ({ ...n, host: endpoint, port, secure })),
      perNodeAccurate: false,
    };
  };

  if (mode === ADDRESSING.ENDPOINT) return withEndpoint();

 
  const candidate = nodes.find((n) => n.host);


  if (mode === ADDRESSING.PER_POD && candidate) {
    return {
      resolution: RESOLUTION.FQDN,
      nodes: nodes.map((n) => ({ ...n, port: 8123, secure: false })),
      perNodeAccurate: true,
      forced: true,
    };
  }

  const fqdnWorks = candidate
    ? await probe({ host: candidate.host, port: 8123, secure: false, user, password })
    : false;

  if (fqdnWorks) {
    return {
      resolution: RESOLUTION.FQDN,

      nodes: nodes.map((n) => ({ ...n, port: 8123, secure: false })),
      perNodeAccurate: true,
    };
  }

 
  let perPod = new Map();
  try {
    perPod = await findPerPodServices(client, namespace);
  } catch {

  }

  const allCovered =
    nodes.length > 0 && nodes.every((n) => n.podName && perPod.has(n.podName));

  if (allCovered) {
    return {
      resolution: RESOLUTION.PER_POD_SERVICE,
      nodes: nodes.map((n) => {
        const svc = perPod.get(n.podName);
        return {
          ...n,

          host: svc.host || endpoint,
          port: svc.port,
          secure,
        };
      }),
      perNodeAccurate: true,
    };
  }


  return withEndpoint();
}
