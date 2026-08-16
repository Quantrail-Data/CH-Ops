// systemSmtp.js - REST API for the system SMTP settings.
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail™ Data Private Limited

import nodemailer from 'nodemailer';
import {
  readStoredSmtp,
  saveSystemSmtp,
  deleteSystemSmtp,
  resolveSystemSmtp,
} from '../services/systemSmtp.js';
import { log } from '../services/logger.js';

// Builds a transport from values posted by the form, so Test can run before anything is saved.
function transportFrom(body) {
  return nodemailer.createTransport({
    host: String(body.host || '').trim(),
    port: parseInt(body.port, 10) || 587,
    secure: body.secure === true || body.secure === 'true',
    auth: body.user ? { user: body.user, pass: body.password || '' } : undefined,
  });
}

export function getSystemSmtp(req, res) {
  const stored = readStoredSmtp();
  const active = resolveSystemSmtp();

// The password never leaves the server. hasPassword is enough for the form to show whether one is set, the same way cluster passwords work.
  res.json({
    configured: !!stored,
    host: stored?.host || '',
    port: stored?.port || '587',
    secure: stored?.secure ?? false,
    user: stored?.user || '',
    from: stored?.from || '',
    hasPassword: !!stored?.passwordEnc,
    source: active?.source || null,
  });
}

export async function testSystemSmtpConnection(req, res) {
  try {
    // A password field left blank means "use the stored one", so fall back to
    // it rather than testing with an empty string and failing for a reason the
    // user did not cause.
    const body = { ...req.body };
    if (!body.password) {
      const active = resolveSystemSmtp();
      body.password = active?.pass || '';
    }

    await transportFrom(body).verify();
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}

export async function sendSystemSmtpTestEmail(req, res) {
  const to = String(req.body.to || '').trim();
  if (!to) return res.status(400).json({ error: 'A destination address is required.' });

  try {
    const body = { ...req.body };
    if (!body.password) {
      const active = resolveSystemSmtp();
      body.password = active?.pass || '';
    }

    await transportFrom(body).sendMail({
      from: body.from,
      to,
      subject: 'CHOps test email',
      text: 'This is a test message from CHOps. If you received it, system email is working.',
    });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
}

export async function putSystemSmtp(req, res) {
  const { host, port, from } = req.body || {};
  if (!String(host || '').trim())
    return res.status(400).json({ error: 'SMTP host is required.' });
  if (!String(from || '').trim())
    return res.status(400).json({ error: 'From address is required.' });

  const p = parseInt(port, 10);
  if (!Number.isInteger(p) || p < 1 || p > 65535)
    return res.status(400).json({ error: 'Port must be between 1 and 65535.' });

  // Test before saving, and refuse on failure. 
  try {
    const body = { ...req.body };
    if (!body.password) {
      const active = resolveSystemSmtp();
      body.password = active?.pass || '';
    }
    await transportFrom(body).verify();
  } catch (err) {
    return res.status(400).json({
      error: `Could not connect with these settings, so nothing was saved: ${err.message}`,
    });
  }

  saveSystemSmtp(req.body);
  log.info('System SMTP settings updated');
  return getSystemSmtp(req, res);
}

export function removeSystemSmtp(req, res) {
  deleteSystemSmtp();
  log.info('System SMTP settings deleted, falling back to the environment');
  return getSystemSmtp(req, res);
}