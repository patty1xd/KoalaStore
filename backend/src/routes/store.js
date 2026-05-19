'use strict';

const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const paypal = require('../paypal');
const { fulfillPurchase, nowSec } = require('../fulfill');

function validUsername(u) {
  return typeof u === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(u);
}

async function mojangUuid(name) {
  try {
    const r = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.id) return null;
    const h = j.id;
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch {
    return null;
  }
}

router.get('/', (req, res) => {
  const packages = db
    .prepare('SELECT * FROM packages WHERE enabled=1 ORDER BY sort, id')
    .all();
  res.render('index', { storeName: getSetting('store_name'), packages });
});

router.get('/package/:id', (req, res) => {
  const pkg = db
    .prepare('SELECT * FROM packages WHERE id=? AND enabled=1')
    .get(req.params.id);
  if (!pkg) {
    return res
      .status(404)
      .render('error', { storeName: getSetting('store_name'), message: 'Package not found' });
  }
  res.render('package', {
    storeName: getSetting('store_name'),
    pkg,
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    currency: process.env.CURRENCY || 'USD',
    paypalReady: paypal.configured(),
  });
});

router.get('/success', (req, res) => {
  res.render('success', { storeName: getSetting('store_name') });
});

router.post('/orders', express.json(), async (req, res) => {
  try {
    const { packageId, username } = req.body || {};
    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Enter a valid Minecraft username (3-16 chars).' });
    }
    const pkg = db
      .prepare('SELECT * FROM packages WHERE id=? AND enabled=1')
      .get(packageId);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (!paypal.configured()) {
      return res.status(503).json({ error: 'PayPal is not configured yet.' });
    }
    const currency = process.env.CURRENCY || 'USD';
    const order = await paypal.createOrder({
      amount: pkg.price,
      currency,
      description: `${getSetting('store_name')} - ${pkg.name}`,
    });
    const uuid = await mojangUuid(username);
    db.prepare(`
      INSERT INTO payments
        (package_id, username, uuid, amount, currency, status, paypal_order_id, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(pkg.id, username, uuid, pkg.price, currency, order.id, nowSec());
    res.json({ id: order.id });
  } catch (e) {
    console.error('createOrder', e);
    res.status(500).json({ error: 'Could not start the payment.' });
  }
});

router.post('/orders/:orderId/capture', express.json(), async (req, res) => {
  try {
    const payment = db
      .prepare('SELECT * FROM payments WHERE paypal_order_id=?')
      .get(req.params.orderId);
    if (!payment) return res.status(404).json({ error: 'Unknown order' });

    const pkgName = () => {
      const p = db.prepare('SELECT name FROM packages WHERE id=?').get(payment.package_id);
      return p ? p.name : '';
    };

    if (payment.status === 'completed') {
      return res.json({ status: 'COMPLETED', package: pkgName() });
    }
    const cap = await paypal.captureOrder(req.params.orderId);
    if (cap.status !== 'COMPLETED') {
      return res.status(402).json({ error: 'Payment not completed', status: cap.status });
    }
    db.prepare("UPDATE payments SET status='completed', completed_at=? WHERE id=?")
      .run(nowSec(), payment.id);
    fulfillPurchase(db.prepare('SELECT * FROM payments WHERE id=?').get(payment.id));
    res.json({ status: 'COMPLETED', package: pkgName() });
  } catch (e) {
    console.error('capture', e);
    res.status(500).json({ error: 'Could not complete the payment.' });
  }
});

// Idempotent PayPal webhook fallback (in case the buyer closes the tab).
router.post('/webhook', express.json({ type: '*/*' }), async (req, res) => {
  try {
    const ok = await paypal.verifyWebhook(req.headers, req.body);
    if (!ok) return res.status(400).end();
    const ev = req.body || {};
    if (
      ev.event_type === 'PAYMENT.CAPTURE.COMPLETED' ||
      ev.event_type === 'CHECKOUT.ORDER.APPROVED'
    ) {
      const r = ev.resource || {};
      const orderId =
        (r.supplementary_data &&
          r.supplementary_data.related_ids &&
          r.supplementary_data.related_ids.order_id) ||
        r.id;
      if (orderId) {
        const payment = db
          .prepare('SELECT * FROM payments WHERE paypal_order_id=?')
          .get(orderId);
        if (payment && payment.status !== 'completed') {
          db.prepare("UPDATE payments SET status='completed', completed_at=? WHERE id=?")
            .run(nowSec(), payment.id);
          fulfillPurchase(db.prepare('SELECT * FROM payments WHERE id=?').get(payment.id));
        }
      }
    }
    res.status(200).end();
  } catch (e) {
    console.error('webhook', e);
    res.status(200).end();
  }
});

module.exports = router;
