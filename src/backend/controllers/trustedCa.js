// trustedCa.js - REST API for the trusted certificate authorities.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import tls from 'node:tls';
import net from 'node:net';
import {
  listTrustedCas,
  addTrustedCa,
  deleteTrustedCa,
  getCaBundle,
} from '../services/trustedCa.js';
import { getAllClusters } from '../services/clusterUtils.js';
import { log } from '../services/logger.js';

// Days until a certificate expires, so the list can flag one running out.
function daysUntil(dateString) {
  if (!dateString) return null;
  const ms = new Date(dateString).getTime() - Date.now();
  return Math.floor(ms / 86400000);
}

export function getTrustedCas(req, res) {
  const rows = listTrustedCas().map(r => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    issuer: r.issuer,
    fingerprint: r.fingerprint,
    notBefore: r.notBefore,
    notAfter: r.notAfter,
    daysUntilExpiry: daysUntil(r.notAfter),
    // The certificate itself is not secret
  }));
  res.json(rows);
}

export function postTrustedCa(req, res) {
  const { name, pem } = req.body || {};
  if (!String(name || '').trim())
    return res.status(400).json({ error: 'A name is required.' });
  if (!String(pem || '').trim())
    return res.status(400).json({ error: 'Paste the certificate.' });

  try {
    addTrustedCa(name, pem);
    log.info(`Trusted certificate authority added: ${name}`);
    return getTrustedCas(req, res);
  } catch (err) {
    // parsePem throws messages written for the person pasting, so pass it on.
    return res.status(400).json({ error: err.message });
  }
}

export function removeTrustedCa(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id.' });

  deleteTrustedCa(id);
  log.info(`Trusted certificate authority removed: id ${id}`);
  return getTrustedCas(req, res);
}

// Which clusters present a certificate signed by this authority.

export async function getCaUsage(req, res) {
  const id = parseInt(req.params.id, 10);
  const all = listTrustedCas();
  const target = all.find(c => c.id === id);
  if (!target) return res.status(404).json({ error: 'Not found.' });

  const bundle = getCaBundle();
  const results = [];

  for (const cluster of getAllClusters()) {
    const node = cluster.nodes?.[0];
    if (!node || !node.secure) {
      results.push({ cluster: cluster.name, status: 'not-tls' });
      continue;
    }

    try {
      const issuer = await peerIssuer(node.host, node.port, bundle);
      results.push({
        cluster: cluster.name,
        // The issuer named on the server's certificate is the authority that signed it.
        status: issuer && target.subject?.includes(issuer) ? 'uses-this' : 'other',
        issuer,
      });
    } catch (err) {
      // A cluster that is down tells us nothing either way
      results.push({ cluster: cluster.name, status: 'unreachable', error: err.message });
    }
  }

  res.json({ id, name: target.name, results });
}

// Opens a TLS connection and reads the issuer from the certificate presented.
// SNI (the servername option) is only valid for hostnames, not IP literals,
// so it is omitted when the cluster host is an IP address.
export function peerIssuer(host, port, ca) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: port || 8443,
        ...(net.isIP(host) ? {} : { servername: host }),
        ...(ca ? { ca } : {}),
        timeout: 5000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert?.issuer?.CN || null);
      },
    );
    socket.on('error', err => reject(err));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timed out.')); });
  });
}