'use strict';

// Inserts two example packages so you can see the store immediately.
// Run once: npm run seed

const { db, getSetting } = require('./src/db');

const count = db.prepare('SELECT COUNT(*) c FROM packages').get().c;
if (count > 0) {
  console.log(`Packages already exist (${count}); not seeding.`);
} else {
  const ins = db.prepare(`
    INSERT INTO packages
      (name, description, price, duration_days, require_online, commands, expiry_commands, enabled, sort)
    VALUES (@name, @description, @price, @duration_days, @require_online, @commands, @expiry_commands, 1, @sort)
  `);

  ins.run({
    name: 'VIP Rank (30 days)',
    description: 'Fly in spawn, /hat, colored chat and a kit. Expires after 30 days.',
    price: 9.99,
    duration_days: 30,
    require_online: 0,
    commands: JSON.stringify([
      'lp user {name} parent add vip',
      'broadcast &b{name} &7just bought &bVIP&7!',
    ]),
    expiry_commands: JSON.stringify(['lp user {name} parent remove vip']),
    sort: 1,
  });

  ins.run({
    name: '5 Diamonds',
    description: 'A one-time pouch of 5 diamonds delivered to your inventory.',
    price: 2.49,
    duration_days: 0,
    require_online: 1,
    commands: JSON.stringify(['give {name} diamond 5']),
    expiry_commands: JSON.stringify([]),
    sort: 2,
  });

  console.log('Seeded 2 example packages.');
}

console.log('Store name :', getSetting('store_name'));
console.log('Server name:', getSetting('server_name'));
console.log('SERVER SECRET (put in the plugin):');
console.log('  ' + getSetting('server_secret'));
