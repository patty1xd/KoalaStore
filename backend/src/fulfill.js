'use strict';

const { db, upsertPlayer } = require('./db');

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseCommands(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr)
      ? arr.filter((s) => typeof s === 'string' && s.trim())
      : [];
  } catch {
    return [];
  }
}

const insertCmd = db.prepare(`
  INSERT INTO command_queue
    (payment_id, package_id, username, uuid, command, require_online, delay, slots, kind, state, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
`);

// Called when a payment becomes completed. Queues the purchase commands and,
// for timed packages, opens a subscription whose expiry triggers the
// expiry_commands later (the Tebex "plan ends" behaviour).
function fulfillPurchase(payment) {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(payment.package_id);
  if (!pkg) return;
  upsertPlayer(payment.username, payment.uuid);
  const cmds = parseCommands(pkg.commands);
  const t = nowSec();
  const tx = db.transaction(() => {
    for (const c of cmds) {
      insertCmd.run(
        payment.id, pkg.id, payment.username, payment.uuid, c,
        pkg.require_online ? 1 : 0, 0, 0, 'purchase', t
      );
    }
    if (pkg.duration_days && pkg.duration_days > 0) {
      db.prepare(`
        INSERT INTO subscriptions
          (payment_id, package_id, username, uuid, started_at, expires_at, state)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(
        payment.id, pkg.id, payment.username, payment.uuid,
        t, t + pkg.duration_days * 86400
      );
    }
  });
  tx();
}

// Sweeps expired subscriptions and queues their expiry_commands (run offline
// so they always apply, even if the player never comes back).
function expireDue() {
  const t = nowSec();
  const due = db
    .prepare("SELECT * FROM subscriptions WHERE state = 'active' AND expires_at <= ?")
    .all(t);
  for (const s of due) {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(s.package_id);
    const cmds = pkg ? parseCommands(pkg.expiry_commands) : [];
    const tx = db.transaction(() => {
      for (const c of cmds) {
        insertCmd.run(
          s.payment_id, s.package_id, s.username, s.uuid, c,
          0, 0, 0, 'expiry', t
        );
      }
      db.prepare("UPDATE subscriptions SET state = 'expired' WHERE id = ?").run(s.id);
    });
    tx();
  }
  return due.length;
}

module.exports = { fulfillPurchase, expireDue, parseCommands, nowSec };
