'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');

const { expireDue } = require('./src/fulfill');

const app = express();
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Plugin protocol needs JSON bodies for DELETE /api/queue.
app.use('/api', express.json());
app.use('/api', require('./src/routes/plugin'));

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/store'));

app.use((req, res) => {
  res.status(404).render('error', { storeName: 'KoalaStore', message: 'Page not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KoalaStore backend listening on :${PORT}`);
});

// Subscription expiry sweep: on boot + hourly.
function sweep() {
  try {
    const n = expireDue();
    if (n > 0) console.log(`Expired ${n} subscription(s); expiry commands queued.`);
  } catch (e) {
    console.error('expiry sweep failed', e);
  }
}
sweep();
setInterval(sweep, 60 * 60 * 1000);
