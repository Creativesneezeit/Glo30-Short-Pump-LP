/**
 * GLO30 Short Pump LP — static file server + lead delivery to GoHighLevel.
 *
 * No framework: the project had no backend at all before this, so this is plain
 * node:http with zero dependencies. Node 18+ for global fetch.
 *
 * Routes:
 *   POST /api/lead   -> creates a GoHighLevel contact
 *   GET  /healthz    -> liveness probe
 *   GET  *           -> static files from this directory
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

/* -------------------------------------------------------------- GHL config */

const GHL_CONTACTS_URL = 'https://services.leadconnectorhq.com/contacts/';
const GHL_API_VERSION = '2021-07-28';
const LEAD_TAG = 'short-pump-landing';
const LEAD_SOURCE = 'Google Ads - Short Pump Lander';

// Read from the environment only. Never hardcode, never default to a fake value.
const TOKEN = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
// Optional: if the GHL location has a custom field for the offer, set its id here
// and the interest value gets written to it as well as tagged.
const INTEREST_FIELD_ID = process.env.GHL_INTEREST_FIELD_ID;

const INTEREST_LABELS = {
  'smart-glo-99': '$99 Smart GLO',
  'tox': 'Tox offer',
  'nano-glo': 'Limited NanoGLO promo',
  'gloria-ai-scan': 'GLOria AI scan'
};

/* ------------------------------------------------------------ static files */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const IMMUTABLE = new Set(['.woff2', '.webp', '.jpg', '.jpeg', '.png', '.svg', '.webm', '.mp4', '.ico']);

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';

  // Resolve inside ROOT only — blocks ../ traversal.
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return send(res, 403, 'Forbidden');

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (stat.isDirectory()) return serveStatic(req, res, rel.replace(/\/?$/, '/'));

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': IMMUTABLE.has(ext) ? 'public, max-age=31536000' : 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
}

/* --------------------------------------------------------------- lead route */

const MAX_BODY = 16 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  if ((contentType || '').includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function handleLead(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return sendJson(res, 413, { ok: false, error: 'payload_too_large' });
  }

  const data = parseBody(raw, req.headers['content-type']);

  // Honeypot: pretend everything went fine, deliver nothing.
  if (data.company) {
    console.log('[lead] honeypot triggered, discarded');
    return sendJson(res, 200, { ok: true, delivered: false, redirect: '/thank-you/' });
  }

  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  if (!email && !phone) {
    return sendJson(res, 400, { ok: false, error: 'email_or_phone_required' });
  }

  const { firstName, lastName } = splitName(data.name);
  const interest = String(data.interest || '').trim();
  const interestLabel = INTEREST_LABELS[interest] || interest;

  if (!TOKEN || !LOCATION_ID) {
    // Misconfiguration is an operator problem, not a visitor problem. The GHL
    // external-tracking script has already captured this lead client-side.
    console.error(
      '[lead] NOT DELIVERED — missing env vars:',
      [!TOKEN && 'GHL_PRIVATE_INTEGRATION_TOKEN', !LOCATION_ID && 'GHL_LOCATION_ID'].filter(Boolean).join(', ')
    );
    return sendJson(res, 200, { ok: true, delivered: false, redirect: '/thank-you/' });
  }

  const tags = [LEAD_TAG];
  if (interest) tags.push('interest-' + interest);

  const payload = {
    locationId: LOCATION_ID,
    firstName,
    lastName,
    name: String(data.name || '').trim(),
    email,
    phone,
    source: LEAD_SOURCE,
    tags,
    attributionSource: {
      url: String(data.page_url || ''),
      campaign: String(data.utm_campaign || ''),
      utmSource: String(data.utm_source || ''),
      utmMedium: String(data.utm_medium || ''),
      utmContent: String(data.utm_term || ''),
      referrer: String(data.referrer || ''),
      gclid: String(data.gclid || ''),
      medium: String(data.utm_medium || '')
    }
  };

  if (INTEREST_FIELD_ID && interestLabel) {
    payload.customFields = [{ id: INTEREST_FIELD_ID, field_value: interestLabel }];
  }

  try {
    const ghlRes = await fetch(GHL_CONTACTS_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Version: GHL_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const text = await ghlRes.text();

    if (ghlRes.ok) {
      let contactId = null;
      try { contactId = (JSON.parse(text).contact || {}).id || null; } catch { /* non-JSON 2xx */ }
      console.log('[lead] delivered to GHL', { contactId, interest, email: email || phone });
      return sendJson(res, 200, { ok: true, delivered: true, redirect: '/thank-you/' });
    }

    // Duplicates are the common 400 here and are not a real failure.
    console.error('[lead] GHL rejected', ghlRes.status, text.slice(0, 500));
    return sendJson(res, 200, { ok: true, delivered: false, redirect: '/thank-you/' });
  } catch (err) {
    console.error('[lead] GHL request failed:', err && err.message);
    return sendJson(res, 200, { ok: true, delivered: false, redirect: '/thank-you/' });
  }
}

/* ------------------------------------------------------------------ server */

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/lead') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end('Method not allowed');
    }
    return handleLead(req, res).catch((err) => {
      console.error('[lead] unhandled:', err);
      sendJson(res, 200, { ok: true, delivered: false, redirect: '/thank-you/' });
    });
  }

  if (urlPath === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      ghlConfigured: Boolean(TOKEN && LOCATION_ID)
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }

  serveStatic(req, res, urlPath === '/' ? '/index.html' : urlPath).catch(() => send(res, 500, 'Server error'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
  if (!TOKEN || !LOCATION_ID) {
    console.warn(
      '[server] GHL delivery DISABLED — set',
      [!TOKEN && 'GHL_PRIVATE_INTEGRATION_TOKEN', !LOCATION_ID && 'GHL_LOCATION_ID'].filter(Boolean).join(' and ')
    );
  } else {
    console.log('[server] GHL delivery enabled for location', LOCATION_ID);
  }
});
