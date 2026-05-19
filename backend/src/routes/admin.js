'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db, getSetting, setSetting } = require('../db');
const { adminAuth } = require('../auth');
const { fulfillPurchase, nowSec } = require('../fulfill');

router.use(adminAuth);
router.use(express.urlencoded({ extended: false }));

function linesToJson(text) {
  const arr = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(arr);
}

router.get('/', (req, res) => {
  const packages = db.prepare('SELECT * FROM packages ORDER BY sort, id').all();
  const payments = db
    .prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 50')
    .all();
  const subs = db
    .prepare('SELECT * FROM subscriptions ORDER BY id DESC LIMIT 50')
    .all();
  res.render('admin', {
    storeName: getSetting('store_name'),
    serverName: getSetting('server_name'),
    secret: getSetting('server_secret'),
    packages,
    payments,
    subs,
  });
});

router.post('/settings', (req, res) => {
  setSetting('store_name', req.body.store_name || 'KoalaStore');
  setSetting('server_name', req.body.server_name || 'My Server');
  res.redirect('/admin');
});

router.post('/secret/regen', (req, res) => {
  setSetting('server_secret', crypto.randomBytes(24).toString('hex'));
  res.redirect('/admin');
});

router.post('/package', (req, res) => {
  const b = req.body;
  const fields = {
    name: b.name || 'Package',
    description: b.description || '',
    price: parseFloat(b.price) || 0,
    image: b.image || '',
    duration_days: parseInt(b.duration_days, 10) || 0,
    require_online: b.require_online ? 1 : 0,
    commands: linesToJson(b.commands),
    expiry_commands: linesToJson(b.expiry_commands),
    enabled: b.enabled ? 1 : 0,
    sort: parseInt(b.sort, 10) || 0,
  };
  if (b.id) {
    db.prepare(`
      UPDATE packages SET name=@name, description=@description, price=@price,
        image=@image, duration_days=@duration_days, require_online=@require_online,
        commands=@commands, expiry_commands=@expiry_commands, enabled=@enabled, sort=@sort
      WHERE id=@id
    `).run({ ...fields, id: Number(b.id) });
  } else {
    db.prepare(`
      INSERT INTO packages
        (name, description, price, image, duration_days, require_online, commands, expiry_commands, enabled, sort)
      VALUES (@name, @description, @price, @image, @duration_days, @require_online, @commands, @expiry_commands, @enabled, @sort)
    `).run(fields);
  }
  res.redirect('/admin');
});

router.post('/package/:id/delete', (req, res) => {
  db.prepare('DELETE FROM packages WHERE id=?').run(req.params.id);
  res.redirect('/admin');
});

// Manually mark a pending payment as paid (testing / off-PayPal sales).
router.post('/payment/:id/deliver', (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
  if (payment && payment.status !== 'completed') {
    db.prepare("UPDATE payments SET status='completed', completed_at=? WHERE id=?")
      .run(nowSec(), payment.id);
    fulfillPurchase(db.prepare('SELECT * FROM payments WHERE id=?').get(payment.id));
  }
  res.redirect('/admin');
});

router.post('/payment/:id/refund', (req, res) => {
  db.prepare("UPDATE payments SET status='refunded' WHERE id=?").run(req.params.id);
  res.redirect('/admin');
});

// Force-expire a subscription now (queues its expiry commands immediately).
router.post('/subscription/:id/expire', (req, res) => {
  const s = db.prepare('SELECT * FROM subscriptions WHERE id=?').get(req.params.id);
  if (s && s.state === 'active') {
    db.prepare('UPDATE subscriptions SET expires_at=? WHERE id=?').run(nowSec() - 1, s.id);
    require('../fulfill').expireDue();
  }
  res.redirect('/admin');
});

module.exports = router;
