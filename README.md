# KoalaStore — self-hosted Tebex-style web store

A complete, self-hosted donation/web-store system for **Paper 1.21.11**, just like
Tebex but running on **your own domain and server**:

1. Players visit **your website**, pick a package, enter their Minecraft name and
   pay with **PayPal**.
2. The backend queues the package's **purchase commands**.
3. The **KoalaStore plugin** polls the backend and runs those commands in‑game.
4. For timed packages, when the **plan ends** the backend queues the package's
   **expiry commands** and the plugin runs them too (removes the rank, etc.).

```
 Buyer ─▶ Storefront (your domain) ─▶ PayPal ─▶ Backend (Node + SQLite)
                                                   │  command queue
 Paper server ◀── KoalaStore plugin ──── polls ────┘
```

## Repository layout

```
KoalaStore/
├── plugin/                     Paper plugin (Maven, Java 21)
│   ├── pom.xml
│   └── src/main/...            Java + plugin.yml + config.yml
├── backend/                    Node.js + SQLite store + API
│   ├── server.js
│   ├── src/                    db, auth, paypal, fulfill, routes
│   ├── views/                  storefront + admin pages
│   ├── public/style.css
│   └── .env.example
├── .github/workflows/build.yml CI: builds the plugin JAR
└── README.md
```

> Push this `KoalaStore/` folder as the **root of your GitHub repo** so the
> workflow at `.github/workflows/build.yml` is picked up.

---

## Part 1 — Build the plugin

### Option A: GitHub Actions (recommended)

Push the repo to GitHub. The workflow **Build KoalaStore** runs automatically and
produces the JAR as a downloadable artifact (Actions → latest run → Artifacts →
`KoalaStore-plugin`). Tagging a commit `vX.Y.Z` also publishes a GitHub Release
with the JAR attached.

### Option B: Build locally

Requires **JDK 21** and Maven:

```bash
cd plugin
mvn -B clean package
# -> plugin/target/KoalaStore-1.0.0.jar
```

> **Note on the Paper version:** `pom.xml` depends on
> `io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT`. If Maven can't resolve that
> exact patch yet, change it to the newest published `1.21.x` (e.g.
> `1.21.8-R0.1-SNAPSHOT`). The plugin only uses stable Bukkit API, so a JAR built
> against any 1.21.x still runs on 1.21.11 (`api-version: '1.21'`).

### Install on the server

1. Drop `KoalaStore-1.0.0.jar` into your Paper server's `plugins/` folder.
2. Start the server once to generate `plugins/KoalaStore/config.yml`.
3. Configure it (Part 4).

---

## Part 2 — Deploy the backend on your Kimsufi/Ubuntu server

SSH into the dedicated server.

### 2.1 Install Node.js 20 + build tools

```bash
sudo apt update
sudo apt install -y curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

`build-essential` is needed for the `better-sqlite3` native module.

### 2.2 Get the code and install

```bash
sudo mkdir -p /opt/koalastore
sudo chown $USER /opt/koalastore
git clone <your-repo-url> /opt/koalastore
cd /opt/koalastore/backend
npm install --omit=dev
```

### 2.3 Configure

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```
PUBLIC_URL=https://store.yourdomain.com
PORT=3000
ADMIN_PASSWORD=a-strong-password
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...
CURRENCY=USD
```

Seed example packages and print your **server secret**:

```bash
npm run seed
```

Copy the printed `SERVER SECRET` — you'll paste it into the plugin.

### 2.4 Run it as a service (systemd)

Create `/etc/systemd/system/koalastore.service`:

```ini
[Unit]
Description=KoalaStore backend
After=network.target

[Service]
WorkingDirectory=/opt/koalastore/backend
ExecStart=/usr/bin/node server.js
Restart=always
User=YOUR_LINUX_USER
EnvironmentFile=/opt/koalastore/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koalastore
sudo systemctl status koalastore
```

### 2.5 Domain + HTTPS (nginx reverse proxy)

Point an A record (e.g. `store.yourdomain.com`) at the server's IP, then:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/koalastore`:

```nginx
server {
    server_name store.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/koalastore /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d store.yourdomain.com
```

Your store is now live at `https://store.yourdomain.com`.

---

## Part 3 — PayPal setup

1. Go to <https://developer.paypal.com/dashboard/applications>.
2. Create an app. Copy the **Client ID** and **Secret** into `.env`.
3. Start with `PAYPAL_ENV=sandbox` and test with sandbox accounts. When ready,
   create a **Live** app and switch to `PAYPAL_ENV=live` with the live creds.
4. **(Optional) Webhook fallback** — in the PayPal app add a webhook pointing to
   `https://store.yourdomain.com/webhook` subscribed to
   `PAYMENT.CAPTURE.COMPLETED`. Put its **Webhook ID** in `PAYPAL_WEBHOOK_ID`.
   This delivers purchases even if the buyer closes the tab before the page
   confirms.

Restart after editing `.env`: `sudo systemctl restart koalastore`.

---

## Part 4 — Connect the plugin to the backend

In `plugins/KoalaStore/config.yml` (or via in‑game commands as OP):

```
/koalastore url https://store.yourdomain.com
/koalastore secret <SERVER SECRET from npm run seed>
/koalastore info          # verifies the connection
/koalastore forcecheck    # poll immediately
```

`store-url` in the config is what `/buy` shows players.

---

## Part 5 — Managing the store

Open `https://store.yourdomain.com/admin` (user `admin`, password =
`ADMIN_PASSWORD`).

You can:

- Set the store/server name and **regenerate the server secret**.
- Create/edit/delete **packages**:
  - **Price**, optional **image**.
  - **Duration (days)** — `0` = permanent. Any value > 0 makes it a timed plan
    whose **expiry commands** run automatically when it ends.
  - **Require player online** — if checked, purchase commands wait until the
    buyer is on the server (e.g. `give`). Uncheck for things like LuckPerms that
    work offline (run immediately).
  - **Purchase commands** / **Expiry commands**, one per line. Placeholders:
    `{name}` / `{username}` and `{uuid}`. Run from console, no leading `/`.
- See **payments**, manually **Mark paid** (for off-PayPal/manual sales or
  testing) or **Refund** (marks the record refunded; issue the actual refund in
  PayPal).
- See **subscriptions** and **End now** to trigger expiry commands immediately.

Example VIP package:

```
Purchase commands:
  lp user {name} parent add vip
  broadcast &b{name} &7purchased &bVIP&7!
Expiry commands:
  lp user {name} parent remove vip
Duration: 30      Require online: off
```

---

## How delivery works (the protocol)

The plugin speaks a small Tebex-style HTTP API, authenticated with the header
`X-KoalaStore-Secret`:

| Method & path                | Purpose                                            |
|------------------------------|----------------------------------------------------|
| `GET /api/information`       | Validate secret; returns store/server name         |
| `GET /api/queue`             | Players with pending online cmds + meta            |
| `GET /api/queue/offline-commands` | Commands that run regardless of online state  |
| `GET /api/player/:id/queue`  | Pending online commands for one player             |
| `DELETE /api/queue`          | Acknowledge executed command ids                   |

- **Offline commands** (require-online off, and all expiry commands) run on the
  next poll even if the player is absent.
- **Online commands** wait until the player is connected; if a package needs
  inventory space (`slots` condition) and the inventory is full, it retries next
  poll instead of being lost.
- Default poll interval is 60s (`check-interval-seconds`, min 15). The backend
  can ask the plugin to poll sooner when there's a backlog.

---

## Security notes

- Keep `ADMIN_PASSWORD`, the **server secret** and PayPal creds private. Anyone
  with the server secret can queue console commands on your server.
- Always run the backend behind HTTPS (Part 2.5). PayPal Live requires HTTPS.
- `.env` and the `data/` SQLite database are git-ignored — never commit them.
- Test the full flow in **PayPal sandbox** before going live.

## Limitations / notes

- Payments are one-time PayPal orders; timed packages expire after
  `duration_days` (Tebex-classic behaviour). True auto-recurring billing
  (PayPal Subscriptions) is not included.
- "Refund" in the admin only marks the local record; perform the money refund in
  the PayPal dashboard.
- SQLite is plenty for a single store; no external DB server needed.
