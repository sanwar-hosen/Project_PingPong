# PingPong 🏓

**Know exactly when someone opens your email — for free, forever.**

PingPong is a self-hosted Gmail email open tracker. A tiny Chrome extension invisibly attaches a tracking pixel to every email you send. When the recipient opens it, your private dashboard logs the exact time, approximate location, and what device they used.

No subscriptions. No third-party services storing your data. You own everything.

---

## How it works (plain English)

1. You write an email in Gmail and click **Send**
2. The Chrome extension silently adds an invisible 1×1 image to your email
3. When your recipient opens the email, their email app loads that image from **your server**
4. Your server logs the open and you see it in your dashboard instantly

---

## What you'll need before starting

- A **GitHub account** — [github.com](https://github.com) (free, takes 2 minutes)
- A hosting account — either **Railway** or **Fly.io** (both free, pick one)
- **Google Chrome** browser
- A **Gmail** account you send from

That's it. No coding experience required for setup.

---

## Overview — the 6 steps

| Step | What you do | Time |
|---|---|---|
| 1 | Get the code onto your computer | 5 min |
| 2 | Deploy the server (Railway or Fly.io) | 15 min |
| 3 | Run the database setup | 2 min |
| 4 | Install the Chrome extension | 3 min |
| 5 | Configure the extension with your server URL | 1 min |
| 6 | Send a test email and verify everything works | 5 min |

---

## Step 1 — Get the code

You need **Git** installed. Check by opening a terminal and typing `git --version`. If you see a version number, you're good. If not, download it from [git-scm.com](https://git-scm.com).

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/Project_PingPong.git
cd Project_PingPong
```

> **Don't have it on GitHub yet?** If this is your own copy of the code, skip the clone and just open the existing folder.

---

## Step 2 — Deploy the server

You have four hosting options. **Pick one.** All work identically once set up. The only difference is the URL format your app gets:

- **Option A — Private VPS:** `https://your-custom-domain.com` *(Runs on your own Ubuntu server — no credit cards for third-party hosting, no cold starts)*
- **Option B — Koyeb + Neon:** `https://your-app.koyeb.app` ✅ **Recommended — no credit card on either service**
- **Option C — Railway:** `https://your-app.up.railway.app` *(may require credit card after trial)*
- **Option D — Fly.io:** `https://your-app.fly.dev` *(requires credit card)*

---

### Option A — Private VPS (e.g. DigitalOcean, Hetzner, AWS, Linode)

If you own or rent a private VPS (Virtual Private Server), you can host PingPong there. This avoids cold starts and relies entirely on your own infrastructure. This guide assumes your VPS runs **Ubuntu 20.04 or newer** (the most common OS for VPS hosting) and that you have a domain name pointing to your VPS IP address.

#### Step 2A.1 — Prepare your Database
You can host PostgreSQL locally on your VPS, but for the simplest setup, we recommend using a free **Neon** PostgreSQL database:
1. Go to [neon.tech](https://neon.tech) → **Sign Up** (GitHub login works)
2. Click **New Project** → give it a name (e.g. `pingpong`) → click **Create Project**
3. Neon creates a database and shows you a connection string. It looks like:
   ```
   postgresql://user:password@ep-something-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy this entire connection string** — you'll need it in Step 2A.5. Keep the tab open.

> Neon's free tier gives you 0.5 GB storage and 190 compute hours/month. At your volume that's more than enough — forever.

#### Step 2A.2 — Connect to your VPS
Open a terminal on your computer and connect to your VPS using SSH (replace `root` and `your_vps_ip` with your actual VPS username and IP):
```bash
ssh root@your_vps_ip
```

#### Step 2A.3 — Install Node.js, Git, and PM2
Run these commands on your VPS terminal to install the necessary software.
```bash
# Update the VPS packages
sudo apt update && sudo apt upgrade -y

# Install Git
sudo apt install -y git

# Install Node.js (Version 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (Process Manager to run the app in the background permanently)
sudo npm install -y pm2 -g
```

#### Step 2A.4 — Clone and Setup the Project
1. Clone your repository onto the VPS:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Project_PingPong.git
   cd Project_PingPong/server
   ```
2. Install the project dependencies:
   ```bash
   npm install
   ```

#### Step 2A.5 — Configure Environment Variables
1. Create a configuration file (called `.env`):
   ```bash
   nano .env
   ```
2. Paste the following settings. Make sure to customize the values:
   ```env
   # The Neon connection string you copied in Step 2A.1
   DATABASE_URL="postgresql://user:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require"

   # A long, random password (40+ characters) to protect your dashboard
   DASHBOARD_SECRET="your-long-random-secret-here"

   # The domain name pointing to your VPS (e.g., https://pingpong.yourdomain.com)
   BASE_URL="https://your-custom-domain.com"

   # The port the app runs on locally (keep it as 3000)
   PORT=3000

   # Set environment to production
   NODE_ENV="production"
   ```
3. Save and close the editor: Press `Ctrl + O`, then `Enter`, then `Ctrl + X`.

#### Step 2A.6 — Deploy Database Tables
Generate the database client and push the tables to Neon:
```bash
npx prisma generate
npx prisma migrate deploy
```

#### Step 2A.7 — Start the Server
Start the application using PM2 so it stays online 24/7:
```bash
pm2 start src/index.js --name pingpong

# Configure PM2 to start automatically if your VPS restarts
pm2 startup
pm2 save
```
> **Note:** PM2 startup will display a command to run (starting with `sudo env PATH=...`). Copy and run that exact command to complete the startup configuration.

#### Step 2A.8 — Configure HTTPS & Nginx (Crucial)
Chrome extensions require a secure HTTPS connection. We will set up **Nginx** as a reverse proxy and use **Certbot** (Let's Encrypt) to get a free SSL certificate.

1. Install Nginx and Certbot:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
2. Open Nginx configuration to direct domain traffic to our app:
   ```bash
   sudo nano /etc/nginx/sites-available/pingpong
   ```
3. Paste the following configuration (replace `your-custom-domain.com` with your actual domain):
   ```nginx
   server {
       listen 80;
       server_name your-custom-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. Enable the configuration and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/pingpong /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```
5. Obtain the SSL Certificate (follow prompts to automatically configure HTTPS redirect):
   ```bash
   sudo certbot --nginx -d your-custom-domain.com
   ```

#### Step 2A.9 — Verify the server is live
Visit `https://your-custom-domain.com/health` in your web browser. You should see:
```json
{"status":"ok","timestamp":"..."}
```
If you see that — ✅ your VPS server is running. Continue to **Step 3**.

---

### Option B — Koyeb + Neon ✅ Recommended free option (no credit card on either)

Koyeb hosts your Node.js app. Neon hosts your PostgreSQL database. They're separate services connected by a single connection string — this is a very common, reliable pattern.

#### Step 2B.1 — Create a Neon account and database

1. Go to [neon.tech](https://neon.tech) → **Sign Up** (GitHub login works)
2. Click **New Project** → give it a name (e.g. `pingpong`) → click **Create Project**
3. Neon creates a database and shows you a connection string. It looks like:
   ```
   postgresql://user:password@ep-something-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy this entire connection string** — you'll need it in Step 2B.4. Keep the tab open.

> Neon's free tier gives you 0.5 GB storage and 190 compute hours/month. At your volume that's more than enough — forever.

#### Step 2B.2 — Create a Koyeb account

1. Go to [koyeb.com](https://koyeb.com) → **Get Started** → sign up (GitHub login works)
2. No credit card required

#### Step 2B.3 — Push your code to GitHub *(skip if already done)*

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pingpong.git
git branch -M main
git push -u origin main
```

#### Step 2B.4 — Create the Koyeb service

1. In Koyeb → **Create Service** → **GitHub**
2. Select your repository
3. Koyeb asks for configuration:

   | Setting | Value |
   |---|---|
   | **Builder** | Buildpack (auto-detected) |
   | **Run command** | `node src/index.js` |
   | **Build command** | `npm install && npx prisma generate && npx prisma migrate deploy` |
   | **Service root** | `server` |
   | **Port** | `3000` |
   | **Instance type** | Free (nano) |

4. Scroll down to **Environment variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The full Neon connection string you copied in Step 2B.1 |
   | `DASHBOARD_SECRET` | A long random password (40+ chars). Generate at [randomkeygen.com](https://randomkeygen.com). **Write this down.** |
   | `NODE_ENV` | `production` |
   | `BASE_URL` | Leave blank for now — fill in after deploy |

5. Click **Deploy**

#### Step 2B.5 — Get your Koyeb URL

1. After deploy completes, Koyeb shows you a URL in the format:
   `https://pingpong-yourname-abc123.koyeb.app`
2. **Copy this URL**
3. Go back to your Koyeb service → **Settings** → **Environment variables** → set `BASE_URL` to this URL → **Redeploy**

#### Step 2B.6 — Verify the server is live

Visit `https://YOUR-KOYEB-URL/health` in your browser. You should see:
```json
{"status":"ok","timestamp":"..."}
```

If you see that — ✅ your server is running. The database tables were created automatically by the build command.

---

### Option C — Railway (easiest, no CLI required)

#### Step 2C.1 — Create a Railway account
1. Go to [railway.app](https://railway.app) and click **Sign Up**
2. Log in with GitHub (fastest option — Railway will ask permission to access your repos)
3. Verify your email if prompted

#### Step 2C.2 — Push your code to GitHub

If your code isn't on GitHub yet:
1. Go to [github.com/new](https://github.com/new) and create a new **empty** repository (name it anything, e.g. `pingpong`)
2. Make it **Private** (your tracking data is private — keep the code private too)
3. Open a terminal in the `Project_PingPong` folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pingpong.git
git branch -M main
git push -u origin main
```

#### Step 2C.3 — Create the Railway project
1. In Railway: **New Project → Deploy from GitHub repo**
2. Select your `pingpong` repository
3. Railway detects it's Node.js automatically — the `server/railway.json` file handles all build and start configuration. **No manual setup needed.**

#### Step 2C.4 — Add a database
1. Inside the same Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically creates a `DATABASE_URL` variable and links it to your app. You'll see it appear in your service's **Variables** tab.

#### Step 2C.5 — Set environment variables

In your Railway app service → **Variables** tab, add these three:

| Variable | Value |
|---|---|
| `DASHBOARD_SECRET` | Make up a long random password (40+ characters). Generate one at [randomkeygen.com](https://randomkeygen.com) — use the "CodeIgniter Encryption Keys" section. **Write this down — you'll need it to open your dashboard.** |
| `NODE_ENV` | `production` |
| `BASE_URL` | Leave blank for now — you'll fill this in after the next step |

#### Step 2C.6 — Get your Railway URL
1. In your Railway app service → **Settings** → **Networking** → click **Generate Domain**
2. You'll get a URL like `https://pingpong-production-abc123.up.railway.app`
3. **Copy this URL**
4. Now go back to the Variables tab and set `BASE_URL` to this URL

#### Step 2C.7 — Verify the server is live

Visit `https://YOUR-RAILWAY-URL/health` in your browser. You should see:
```json
{"status":"ok","timestamp":"..."}
```

If you see that — ✅ your server is running. Skip to **Step 3**.

---

### Option D — Fly.io *(requires credit card — skip if you don't have one)*

#### Step 2D.1 — Create a Fly.io account
1. Go to [fly.io](https://fly.io) → **Get Started**
2. Sign up with GitHub or email
3. You may be asked for a credit card to verify your identity — Fly.io has a generous free tier and won't charge you at this volume

#### Step 2D.2 — Install the Fly.io CLI (`flyctl`)

Open a terminal and run:

```bash
# macOS / Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Then log in:
```bash
flyctl auth login
```

This opens a browser window — log in with your Fly.io account.

#### Step 2D.3 — Open the server folder

All Fly.io commands must be run from inside the `server/` folder:
```bash
cd server
```

#### Step 2D.4 — Edit `fly.toml` with your app name

Open `server/fly.toml` in any text editor. Change the first line to a unique name (it becomes part of your URL):

```toml
app = "pingpong-yourname"    # must be globally unique on Fly.io
```

#### Step 2D.5 — Create the app on Fly.io

```bash
flyctl launch --no-deploy
```

When prompted:
- **"Would you like to copy its configuration to the new app?"** → Yes
- **"Would you like to set up a Postgresql database?"** → Yes → choose **Development** (free)
- **"Would you like to set up an Upstash Redis database?"** → No

This creates your app and a free Postgres database, and automatically links `DATABASE_URL`.

#### Step 2D.6 — Set environment variables (secrets)

```bash
flyctl secrets set \
  DASHBOARD_SECRET="your-long-random-secret-here" \
  NODE_ENV="production" \
  BASE_URL="https://pingpong-yourname.fly.dev"
```

> Replace `pingpong-yourname` with the actual app name you chose in Step 2D.4.
> Replace `your-long-random-secret-here` with a random 40+ character string. Generate one at [randomkeygen.com](https://randomkeygen.com). **Write this down — you need it to open your dashboard.**

#### Step 2D.7 — Deploy

```bash
flyctl deploy
```

This builds your server, runs the database migrations automatically, and starts the app. Watch the logs — when you see `✓ Machine ... is now up`, you're live.

#### Step 2D.8 — Verify the server is live

```bash
flyctl open /health
```

Or visit `https://pingpong-yourname.fly.dev/health` in your browser. You should see:
```json
{"status":"ok","timestamp":"..."}
```

If you see that — ✅ your server is running.

---

## Step 3 — Verify database tables

> Migrations run automatically during every deploy/setup for all platforms. This step is just a sanity check.

**Private VPS / Koyeb + Neon:** In [neon.tech](https://neon.tech) → your project → **Tables** tab → you should see `emails` and `open_events`.

**Railway:** In Railway → click your **PostgreSQL** service → **Data** tab → you should see `emails` and `open_events` tables.

**Fly.io:** Run `flyctl postgres connect -a your-postgres-app-name` or check via the Fly.io dashboard.

If the tables aren't there, trigger a redeploy or manually run migrations (`npx prisma migrate deploy`) — the migration runs and creates them.

---

## Step 4 — Install the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Navigate to the `extension/` folder inside your `Project_PingPong` folder and select it
5. The PingPong 🏓 icon appears in your Chrome toolbar (click the puzzle piece icon → pin it for easy access)

---

## Step 5 — Configure the extension

This is the one step that connects your extension to your server.

1. Click the **PingPong 🏓 icon** in your Chrome toolbar
2. The popup shows **"Not configured — open ⚙ Settings"**
3. Click **⚙ Settings** at the bottom
4. Fill in:
   - **Backend URL:** your full server URL — `https://your-custom-domain.com`, `https://your-app.up.railway.app`, or `https://your-app.fly.dev`
   - **Dashboard Secret:** the `DASHBOARD_SECRET` value you set in Step 2
5. Click **Save & reconnect**

The popup should now show **"Online"** with a green dot. That means the extension can reach your server. ✅

> **If it shows "Offline":** double-check your Backend URL (no trailing slash, must start with `https://`). Visit the `/health` URL in your browser to confirm the server is up.

---

## Step 6 — Send a test email and verify

1. Open Gmail and click **Compose**
2. Write any email to yourself (use a second Gmail account, or any other email address you can access)
3. Click **Send** — the extension silently injects the tracking pixel
4. On your phone or another device, **open the email you just sent**
5. Wait a few seconds, then open your dashboard:

```
https://YOUR-SERVER-URL/dashboard?key=YOUR_DASHBOARD_SECRET
```

**Bookmark this URL** — it's your only entry point to the dashboard. Include the `?key=...` part.

You should see the email in the list with **Open Count: 1**. Click it for the full detail view showing the exact timestamp, approximate location, and device.

🎉 **PingPong is live.**

---

## Using the dashboard

| URL | What it shows |
|---|---|
| `/dashboard?key=YOUR_SECRET` | List of all tracked emails with open counts |
| `/dashboard/email/:id` | Full open history for one email — timestamp, location, device per open |

**Tip:** Bookmark the full dashboard URL including `?key=YOUR_SECRET` — you'll need it every time. There's no password screen; the secret in the URL is your access control.

---

## Known limitations (industry-wide, not specific to PingPong)

| Situation | What you'll see |
|---|---|
| **Recipient uses Gmail** | Opens show Google's proxy server location (Mountain View, CA) instead of the recipient's real location. This affects every pixel tracker, not just PingPong. |
| **Recipient uses Apple Mail** | Apple Mail Privacy Protection may pre-fetch the pixel even before the email is opened, causing a false "open" notification. |
| **Recipient's app blocks remote images** | No open will be logged until they click "Show images" — same as every commercial tracker. |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Extension popup shows "Setup needed" | Open ⚙ Settings in the popup and enter your server URL and dashboard secret |
| Extension popup shows "Offline" | Your server URL is wrong, or the server isn't running. Visit `/health` in your browser to check. |
| Emails in dashboard but 0 opens | The recipient's email client blocked remote images. This is expected behavior. |
| All opens show "Mountain View, CA" | Recipient is on Gmail — Google proxies the pixel through their servers. Expected. |
| Dashboard shows "Unauthorized" | The `?key=` in your URL doesn't exactly match `DASHBOARD_SECRET` on the server. |
| No emails appear in the dashboard | The extension may not have detected the Send button. Check the browser console on mail.google.com for `[PingPong]` log messages. |
| Railway/Fly.io/Koyeb/VPS setup failed | Check the build/setup logs. Most common cause: `DATABASE_URL` not set correctly, or (for Koyeb) the **Service root** is not set to `server`. |

---

## Deployment files reference

| File | Purpose |
|---|---|
| `server/railway.json` | Railway deployment config — auto-runs migrations, sets start command |
| `server/fly.toml` | Fly.io deployment config — auto-runs migrations via `release_command` |
| `server/package.json` | `postinstall` script auto-runs `prisma generate` after `npm install` |
| `extension/` | Chrome extension — load unpacked, configure via popup |

All four config files/methods (PM2/Nginx, `railway.json`, `fly.toml`, and the Koyeb settings) coexist fine. Use whichever platform you deploy to — the others are simply ignored.

---

## Updating in the future

After any code change, just push to GitHub:

```bash
git add .
git commit -m "describe your change"
git push
```

- **Private VPS:** run `git pull`, `npm install`, `npx prisma migrate deploy` (if database schema changed), and restart the app with `pm2 restart pingpong` inside your `server/` folder.
- **Railway:** auto-deploys from GitHub on every push (if you connected the repo)
- **Fly.io:** run `flyctl deploy` from the `server/` folder
- **Koyeb:** auto-deploys from GitHub on every push (if you connected the repo)

Migrations run automatically on every deploy/setup — you never need to run them manually.

---

## License

Private project — no external license.
