'use strict';

const crypto = require('crypto');
const { getSetting } = require('./db');

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Guards the /api/* plugin protocol with the per-server secret.
function pluginAuth(req, res, next) {
  const provided = req.get('X-KoalaStore-Secret') || '';
  const expected = getSetting('server_secret') || '';
  if (!expected || !timingSafeEqual(provided, expected)) {
    return res.status(403).json({ error: 'Invalid server secret' });
  }
  next();
}

// HTTP Basic auth for the /admin panel.
function adminAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const expected = process.env.ADMIN_PASSWORD || 'change-this-now';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (user === 'admin' && timingSafeEqual(pass, expected)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="KoalaStore Admin"');
  return res.status(401).send('Authentication required');
}

module.exports = { pluginAuth, adminAuth };
