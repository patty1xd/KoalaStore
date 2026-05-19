'use strict';

const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const { pluginAuth } = require('../auth');
const { nowSec } = require('../fulfill');

router.use(pluginAuth);

// Secret check + store/server identity.
router.get('/information', (req, res) => {
  res.json({
    store: { name: getSetting('store_name') },
    server: { name: getSetting('server_name') },
  });
});

// Who has work waiting + how the plugin should behave.
router.get('/queue', (req, res) => {
  const offlinePending = db
    .prepare("SELECT COUNT(*) c FROM command_queue WHERE state='pending' AND require_online=0")
    .get().c;
  const onlinePending = db
    .prepare("SELECT COUNT(*) c FROM command_queue WHERE state='pending' AND require_online=1")
    .get().c;
  const players = db.prepare(`
    SELECT p.id AS id, p.username AS name, p.uuid AS uuid
    FROM players p
    WHERE EXISTS (
      SELECT 1 FROM command_queue q
      WHERE q.state='pending' AND q.require_online=1
        AND q.username = p.username COLLATE NOCASE
    )
  `).all();
  res.json({
    meta: {
      next_check: 60,
      more: onlinePending > 50,
      execute_offline: offlinePending > 0,
    },
    players,
  });
});

// Commands that run regardless of whether the buyer is online.
router.get('/queue/offline-commands', (req, res) => {
  const rows = db
    .prepare("SELECT * FROM command_queue WHERE state='pending' AND require_online=0 ORDER BY id LIMIT 100")
    .all();
  res.json({
    commands: rows.map((r) => ({
      id: r.id,
      command: r.command,
      package: r.package_id,
      conditions: { delay: r.delay },
      player: { name: r.username, uuid: r.uuid },
    })),
  });
});

// Commands for one player, run only while they are connected.
router.get('/player/:id/queue', (req, res) => {
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!p) return res.json({ player: null, commands: [] });
  const rows = db
    .prepare(
      "SELECT * FROM command_queue WHERE state='pending' AND require_online=1 " +
      'AND username = ? COLLATE NOCASE ORDER BY id LIMIT 100'
    )
    .all(p.username);
  res.json({
    player: { id: p.id, name: p.username, uuid: p.uuid },
    commands: rows.map((r) => ({
      id: r.id,
      command: r.command,
      package: r.package_id,
      conditions: { delay: r.delay, slots: r.slots },
    })),
  });
});

// Plugin acknowledges executed commands.
router.delete('/queue', (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  const upd = db.prepare(
    "UPDATE command_queue SET state='executed', executed_at=? WHERE id=? AND state='pending'"
  );
  const t = nowSec();
  const tx = db.transaction(() => {
    for (const id of ids) upd.run(t, Number(id));
  });
  tx();
  res.json({ ids });
});

module.exports = router;
