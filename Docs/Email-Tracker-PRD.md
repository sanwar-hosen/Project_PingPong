# Project Requirement Document: Gmail Email Open Tracker

**Project codename:** PingPong
**Owner:** Sano
**Prepared for:** Google Antigravity build agent
**Version:** 1.0
**Date:** 2026-07-05

---

## 1. Purpose & Background

Sano currently relies on a third-party Gmail tracking add-on (paid tiers gate open counts, timestamps, and open history). This project replaces that dependency with a **fully self-hosted, zero-paywall, unlimited-use email open tracker** for Gmail.

Core guarantee: every feature described here has **no usage cap, no premium tier, and no recurring cost** beyond free-tier hosting limits (which comfortably cover the target volume of under 100 tracked emails/month).

---

## 2. Goals & Non-Goals

### 2.1 Goals (v1 scope)
- Auto-insert a unique invisible tracking pixel into every email sent from Gmail's compose window, via a Chrome extension.
- Log every time that pixel is loaded (i.e. every email open) with timestamp, approximate location (from IP), and device/client info (from User-Agent).
- Support **per-recipient tracking** as an architectural capability (not required to be exposed in the UI immediately, but the data model must not block it later).
- Persist all data long-term in a real database (Postgres).
- Provide a simple two-tier web dashboard:
  - **List view:** every tracked email sent, with subject, recipient(s), send time, and total open count.
  - **Detail view:** click into any email to see every individual open event (timestamp, count number, rough location, device).
- No login/auth required — single-user, private-by-obscurity dashboard (protected only by a hard-to-guess URL/token, see Section 6.3).

### 2.2 Explicit Non-Goals (v1)
- **No click tracking** (link rewriting) — explicitly excluded from this version.
- **No multi-user support / login system** — single user only.
- **No mobile app** — web dashboard only, works fine on mobile browser regardless.
- **No email sending functionality** — this tool only tracks emails sent normally through Gmail; it does not send email itself.

### 2.3 Future headroom (not built now, but architecture shouldn't block it later)
- Per-recipient open attribution surfaced in the UI (data model supports it from day one; UI can be added later without a schema rewrite).
- Click tracking (can be added later as an additional redirect-based endpoint).
- Optional lightweight auth if the dashboard is ever exposed more publicly.

---

## 3. Key Architecture

### 3.1 High-level flow

```
[Gmail Compose Window]
        │
        │ (1) Chrome extension detects "Send" click
        ▼
[Chrome Extension - content script]
        │
        │ (2) Generates unique tracking ID (UUID)
        │ (3) Injects invisible 1x1 pixel <img> tag into email body,
        │     pointing to hosted pixel endpoint with tracking ID in URL
        ▼
[Email sent normally via Gmail]
        │
        │ (4) Recipient opens email → their email client requests the pixel image
        ▼
[Hosted Backend - Node.js/Express on Railway]
        │
        │ (5) Logs open event to Postgres (timestamp, IP, user-agent, tracking ID)
        │ (6) Returns a real 1x1 transparent GIF (so nothing looks broken)
        ▼
[Postgres Database - Railway managed Postgres]
        │
        │ (7) Dashboard queries this data
        ▼
[Web Dashboard - served by same Node.js backend]
        │
        └─ List view + Detail view (server-rendered or lightweight SPA)
```

### 3.2 Technology stack

| Layer | Technology | Reasoning |
|---|---|---|
| Chrome Extension | Manifest V3, vanilla JS (content script + minimal background service worker) | No framework needed for a small content-script injection; keeps it lightweight and easy for Antigravity to scaffold |
| Backend API | Node.js + Express | Simple, well-documented, minimal boilerplate, huge ecosystem, easy Railway deployment |
| Database | PostgreSQL (Railway managed Postgres, free tier) | Real persistence, relational structure fits emails→opens 1-to-many cleanly, free tier sufficient at this volume |
| ORM / DB access | Prisma | Type-safe queries, easy migrations, works cleanly with Antigravity-style codegen, good fit for Node+Postgres |
| Dashboard frontend | Server-rendered EJS templates **or** a minimal React SPA served from the same Express app (pick EJS for v1 simplicity — see Section 3.3) | Avoids a second deployment/hosting target; keeps everything in one Railway service |
| Hosting | Railway (single service: Express app + Postgres plugin) | No cold-start sleep issue (unlike Render free tier), usage-based free credit comfortably covers <100 emails/month, single dashboard to manage both app and DB |
| Pixel image | Static 1x1 transparent GIF served as binary buffer response | GIF (not PNG) for maximum compatibility with older email client image renderers |

### 3.3 Why EJS over React for the dashboard
Given the low complexity (a list page + a detail page, no complex client-side interactivity, no real-time updates needed), a server-rendered EJS approach avoids the overhead of a separate frontend build pipeline, a second deployment target, or CORS configuration. This keeps the entire project inside **one Railway service or a max of two Railway services (app + DB)**, and keeps the file structure Antigravity needs to generate dramatically simpler. React can be swapped in later if the dashboard grows more complex (e.g. real-time updates, filters, charts).

### 3.4 Data model (Prisma schema concept)

Two core tables, designed from day one to support per-recipient tracking even though the UI won't expose it in v1:

**`Email` table**
- `id` (UUID, primary key) — this is the tracking ID embedded in the pixel URL
- `subject` (string, optional — filled in manually or left blank if not captured)
- `recipient` (string — primary recipient email, or comma-joined list for now)
- `sentAt` (timestamp)
- `createdAt` (timestamp, auto)

**`OpenEvent` table**
- `id` (UUID, primary key)
- `emailId` (foreign key → Email.id)
- `openedAt` (timestamp, auto on insert)
- `ipAddress` (string)
- `userAgent` (string)
- `approxLocation` (string, nullable — derived from IP via free geolocation lookup)
- `recipientHint` (string, nullable — reserved for future per-recipient attribution; unused in v1 UI but present in schema)

This structure means: **total open count** = count of `OpenEvent` rows per `emailId`. **Individual open event list** = all `OpenEvent` rows for that `emailId`, sorted by `openedAt`.

---

## 4. Scope of Work — Phased Plan

### **Phase 0: Environment & Project Setup** *(local only)*
- [x] Initialize monorepo with two top-level folders: `/extension` and `/server`.
- [x] Set up Prisma schema with `Email` and `OpenEvent` models (`schema.prisma` complete).
- [x] Set up `.env` handling for `DATABASE_URL`, `BASE_URL`, and `DASHBOARD_SECRET` (`.env.example` complete).
- [x] `docker-compose.yml` present for local Postgres instance.
- [x] `railway.json` deployment config scaffolded (used in Phase 6).
- [x] Run initial Prisma migration against local Postgres (`prisma migrate dev`).
- [x] Confirm local server starts and `GET /health` returns `{ status: 'ok' }`.

> **Strategy:** All development (Phases 0–5) is done locally against the Docker Compose Postgres. Railway deployment is deferred to **Phase 6** after the full system is verified locally.

**Deliverable:** Local Express app running on `http://localhost:3000`, connected to local Postgres via Docker Compose, with Prisma migrations applied and health check passing.

---

### **Phase 1: Backend — Pixel Tracking Endpoint**
- [ ] Build `GET /pixel/:trackingId.gif` route:
  - [ ] Look up or auto-create the `Email` row for `trackingId` if it doesn't exist (handles the case where the extension didn't pre-register the email).
  - [ ] Insert a new `OpenEvent` row: capture IP (from request headers, accounting for proxy headers like `x-forwarded-for` since Railway sits behind a proxy), User-Agent, and timestamp.
  - [ ] Perform a lightweight free IP-to-location lookup (e.g. using a free-tier geolocation API or a local IP-range dataset) to populate `approxLocation`. This must fail gracefully (log the open even if location lookup fails).
  - [ ] Respond with a real 1x1 transparent GIF binary, correct `Content-Type: image/gif`, and cache-busting headers (`Cache-Control: no-store`) so repeated opens aren't silently deduplicated by client-side caching.
- [ ] Build `POST /api/emails` route (optional, used by the extension to pre-register subject/recipient metadata at send time, so the dashboard has richer info than just tracking ID).

**Deliverable:** A working pixel endpoint, testable by manually visiting the URL in a browser and confirming a new `OpenEvent` row appears in the database each time.

---

### **Phase 2: Chrome Extension — Pixel Injection**
- [ ] Manifest V3 extension targeting `mail.google.com`.
- [ ] Content script that:
  - [ ] Detects the Gmail "Send" button click event on the compose window (Gmail's DOM structure will need selector targeting — this is the trickiest part and may need adjustment if Gmail changes its markup).
  - [ ] Generates a UUID client-side for the tracking ID.
  - [ ] Injects a hidden `<img src="http://localhost:3000/pixel/[uuid].gif" width="1" height="1" style="display:none">` tag at the end of the email body before the send action completes. *(URL is swapped to the Railway domain in Phase 6 before go-live.)*
  - [ ] Optionally calls `POST /api/emails` first to register subject line and recipient(s) captured from the compose window fields, associating them with the same UUID.
- [ ] Extension popup (minimal): shows connection status to the backend, and a link/button to open the dashboard directly.

**Deliverable:** Installable unpacked Chrome extension that successfully injects a working pixel into real sent Gmail emails, confirmed by opening the sent email from a second account/device and seeing a new `OpenEvent` logged.

---

### **Phase 3: Dashboard — List View**
- [ ] Route: `GET /dashboard` (protected by a simple secret token in the URL query string or a cookie set once manually — see Section 6.3; no full login system).
- [ ] Query all `Email` rows, left-joined with a count of related `OpenEvent` rows, sorted by `sentAt` descending.
- [ ] Render as an EJS template: simple table — Subject, Recipient, Sent At, Open Count, "View Details" link.
- [ ] Basic empty-state handling (no emails tracked yet) and basic styling (doesn't need to be fancy, just clean and readable).

**Deliverable:** Working list page showing real tracked emails and their open counts, pulling live from Postgres.

---

### **Phase 4: Dashboard — Detail View**
- [ ] Route: `GET /dashboard/email/:id`.
- [ ] Query the specific `Email` row plus all its `OpenEvent` rows, sorted by `openedAt` ascending (or descending — chronological order, oldest or newest first, either is fine, oldest-first probably more intuitive for "read history").
- [ ] Render as an EJS template: header showing subject/recipient/sent time, followed by a table/list of every open event — timestamp, approx location, device/client (parsed roughly from User-Agent, e.g. "iPhone – Mail App" or "Windows – Chrome").
- [ ] Include a simple "open count over time" mini visual if feasible (a basic sparkline or just a simple ordered list is enough for v1 — doesn't need to be a full chart library integration).

**Deliverable:** Working detail page for any tracked email showing its complete open history.

---

### **Phase 5: Polish, Edge Cases & Hardening** *(local)*
- [ ] Handle Gmail's "Undo Send" delay window (avoid double-injecting pixels or racing with Gmail's own send-cancel logic).
- [ ] Handle image-proxy behavior from major email providers (Gmail itself proxies images through Google's own servers when the *recipient* is also on Gmail — meaning `approxLocation`/IP will reflect Google's proxy, not the recipient's real location; this is a known, unavoidable limitation of pixel tracking for Gmail-to-Gmail emails, and should be noted in the dashboard UI as a caveat rather than presented as precise data).
- [ ] Deduplicate rapid repeated opens if needed (e.g. some clients "prefetch" images multiple times in quick succession — consider a short debounce window, e.g. ignore opens from the same IP within 2 seconds of a previous logged open, to avoid inflated counts from technical artifacts rather than genuine re-opens).
- [ ] Basic error logging (e.g. simple console/log file, no need for a full observability stack at this scale).
- [ ] Full local end-to-end test: send a real Gmail from the extension pointing at `localhost:3000`, confirm open events log correctly, confirm dashboard displays them.

**Deliverable:** Fully working system verified locally. Ready to deploy.

---

### **Phase 6: Railway Deployment & Go-Live**
- [ ] Create Railway project: one Node.js service + one Postgres plugin.
- [ ] Push code to GitHub and connect the repo to Railway for auto-deploy.
- [ ] Set Railway environment variables: `DATABASE_URL` (auto-linked by Railway), `DASHBOARD_SECRET`, `BASE_URL` (set to the live Railway domain), `NODE_ENV=production`.
- [ ] Run Prisma migration against Railway Postgres: `railway run npx prisma migrate deploy`.
- [ ] Generate Railway domain and confirm `GET /health` returns `{ status: 'ok' }` on the live URL.
- [ ] Update the pixel base URL constant in `content-script.js` from `localhost:3000` to the live Railway domain.
- [ ] Reload the unpacked Chrome extension and send a real test email to confirm end-to-end tracking works on the live deployment.
- [ ] Write README with local dev setup + Railway deployment instructions.

**Deliverable:** A stable, live, publicly-reachable deployment on Railway with all known limitations clearly documented.

---

## 5. File Structure

```
mailping/
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── index.js                 # Express app entry point
│   │   ├── routes/
│   │   │   ├── pixel.js             # GET /pixel/:trackingId.gif
│   │   │   ├── api.js               # POST /api/emails
│   │   │   └── dashboard.js         # GET /dashboard, GET /dashboard/email/:id
│   │   ├── lib/
│   │   │   ├── prismaClient.js
│   │   │   ├── geoLookup.js         # IP → approx location helper
│   │   │   └── userAgentParser.js   # UA string → readable device/client label
│   │   └── views/
│   │       ├── list.ejs
│   │       ├── detail.ejs
│   │       └── partials/
│   │           ├── header.ejs
│   │           └── footer.ejs
│   ├── public/
│   │   ├── pixel.gif                # static fallback transparent gif
│   │   └── styles.css
│   ├── package.json
│   ├── .env.example
│   └── railway.json (or railway.toml, if needed for build config)
│
├── extension/
│   ├── manifest.json
│   ├── content-script.js            # Gmail compose detection + pixel injection
│   ├── background.js                # service worker, minimal
│   ├── popup.html
│   ├── popup.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── README.md
└── .gitignore
```

---

## 6. Non-Functional Requirements

### 6.1 Performance
- At <100 emails/month, no meaningful load concerns. Pixel endpoint should respond in well under 200ms to avoid any visible delay in image rendering in the recipient's email client.

### 6.2 Reliability
- Pixel endpoint must **never throw a hard error that breaks the image response** — even if the database write fails, it should still attempt to return a valid transparent GIF (fail silently on logging, never fail visibly to the recipient).

### 6.3 Security & Privacy
- No formal login system (per requirements), but the `/dashboard` routes should be protected by a simple shared-secret token (e.g. `?key=your-long-random-token` checked against an environment variable) so the dashboard isn't fully public to anyone who guesses the Railway URL.
- IP addresses and location data are personally identifiable to some degree — store them, but don't expose them anywhere beyond the private dashboard.
- No third-party analytics or external calls beyond the free IP-geolocation lookup service.

### 6.4 Known Limitations (to document clearly, not hide)
- Gmail-to-Gmail opens will show Google's proxy server info rather than the recipient's real IP/location — this is a universal limitation of pixel tracking against Gmail, not a bug in this system.
- Some email clients block remote images by default until the user clicks "show images" — meaning "opened" technically means "opened and loaded remote images," which is the same caveat every commercial email tracker has.
- Apple Mail Privacy Protection (MPP) pre-fetches images for *all* emails regardless of whether the user actually reads them, which can produce false-positive "opens" for Apple Mail users — this is a known industry-wide limitation, not specific to this build.

---

## 7. Success Criteria (v1 "Done" definition)
- [ ] Chrome extension successfully injects a tracking pixel into every Gmail email sent, without breaking normal Gmail send functionality.
- [ ] Every genuine open (barring the documented client-side limitations above) is logged with timestamp, approximate location, and device info.
- [ ] Dashboard list view shows all tracked emails with accurate open counts.
- [ ] Dashboard detail view shows the complete chronological open history for any selected email.
- [ ] Entire system runs on Railway's free tier at the target volume (<100 emails/month) with no unexpected costs.
- [ ] No feature in this document is gated behind any paywall, tier, or subscription — full functionality, always free.

---

## 8. Notes for the Build Agent (Google Antigravity)
- Prioritize Phase 0 → Phase 1 → Phase 2 in strict order — the pixel endpoint must exist and be tested *before* wiring up the extension, since the extension has nothing to point to otherwise.
- Phase 4's "device/client parsing" from User-Agent strings doesn't need a heavy library — a small set of regex checks for common patterns (iPhone Mail, Outlook, Gmail app, Chrome desktop, etc.) is sufficient; falling back to "Unknown device" is fine for anything unrecognized.
- Keep the Chrome extension's Gmail DOM selectors isolated in one clearly-commented section of `content-script.js`, since Gmail's front-end markup changes periodically and this will likely need future maintenance independent of the rest of the system.

---

## 9. Post-Development Setup & Usage Guide

This section covers everything needed **after** Antigravity finishes building the project — from account creation to actually tracking your first real email. Written for a first-time Railway signup, single Gmail account, and assumes comfort with Chrome's unpacked extension loading.

### 9.1 One-time account & hosting setup

**Step 1 — Create a Railway account**
1. Go to `railway.app` and sign up (GitHub login is the fastest option, since you'll likely want to push this project's code to a GitHub repo anyway for Railway to deploy from).
2. Verify your email if prompted.
3. Railway will ask for a payment method to unlock the usage-based free tier eventually, but at your volume (<100 emails/month) you should stay within the free monthly credit indefinitely. You can skip adding a card initially — Railway allows a trial period without one — and only add it if/when prompted.

**Step 2 — Push the generated project to GitHub**
1. Once Antigravity finishes generating the `server/` folder, initialize a git repo inside it (if not already done): `git init`, `git add .`, `git commit -m "initial commit"`.
2. Create a new empty repository on GitHub (e.g. `mailping-server`).
3. Push: `git remote add origin [your-repo-url]`, then `git push -u origin main`.
4. Keep the `extension/` folder in the same repo or a separate one — either works, since it's never deployed to Railway (it only runs locally in Chrome).

**Step 3 — Create the Railway project**
1. In the Railway dashboard, click **New Project → Deploy from GitHub repo**, and select your `mailping-server` repo.
2. Railway will auto-detect it's a Node.js app and attempt a build. If it needs a start command, set it explicitly in Railway's service settings to `node src/index.js` (or whatever your actual entry file is called).
3. Add a **Postgres database**: in the same Railway project, click **New → Database → Add PostgreSQL**. Railway automatically creates a `DATABASE_URL` environment variable and makes it available to your app service.

**Step 4 — Set environment variables**
In your Railway app service's **Variables** tab, add:
- `DATABASE_URL` — Railway usually auto-links this from the Postgres plugin; confirm it's present.
- `DASHBOARD_SECRET` — make up a long random string yourself (e.g. generate one at `randomkeygen.com` or just mash your keyboard for 40+ characters). This is the token that protects your `/dashboard` route.
- Any geolocation API key, if the IP-lookup service Antigravity chose requires one (some free-tier geo APIs work keyless; check what was actually implemented).

**Step 5 — Run the database migration**
1. Railway gives you a way to run one-off commands against your deployed service (via the **Railway CLI**, or a "Run command" option in the dashboard).
2. Install the Railway CLI locally if you don't have it: `npm install -g @railway/cli`, then `railway login`.
3. Link your local project folder to the Railway project: `railway link`.
4. Run the Prisma migration against the live database: `railway run npx prisma migrate deploy`.
5. Confirm it succeeded — Railway's Postgres plugin has a built-in data browser where you should now see empty `Email` and `OpenEvent` tables.

**Step 6 — Get your live app URL**
1. In the Railway app service, go to **Settings → Networking** and click **Generate Domain**. Railway gives you a free `*.up.railway.app` URL.
2. Test it: visit `https://[your-app].up.railway.app/pixel/test123.gif` in your browser. You should see a tiny blank image load with no errors, and a new row should appear in your `OpenEvent` table for tracking ID `test123`.
3. **Save this URL** — you'll need it in the next step for the Chrome extension.

### 9.2 Installing the Chrome extension

Since you're already comfortable with unpacked extensions, the short version:

1. In `extension/`, open `content-script.js` and update the base pixel URL constant to point to your real Railway domain from Step 6 above (e.g. `https://mailping-production.up.railway.app`).
2. Go to `chrome://extensions`, enable **Developer mode** (top right toggle).
3. Click **Load unpacked**, and select the `extension/` folder.
4. Confirm the extension icon appears in your Chrome toolbar and shows "Connected" (or equivalent status) when you click it — this confirms it can reach your Railway backend.
5. Pin the extension icon for easy access if you want a visual reminder it's active.

**Note:** unpacked extensions reset if Chrome updates in certain ways or if you ever remove/re-add the folder — if it ever disappears from your toolbar, just repeat step 3 pointing at the same folder.

### 9.3 Sending your first tracked email

1. Open Gmail, click **Compose**.
2. Write your email normally — subject, recipient, body — exactly as you always would.
3. Click **Send**.
4. Behind the scenes, the extension will have already injected the invisible pixel into the email body before it left your outbox — you won't see or notice anything different in the compose window.
5. **Important first-run sanity check:** since Gmail's "Undo Send" feature delays actual delivery by a few seconds, don't worry if the pixel doesn't register instantly — it only starts counting opens once the recipient's client actually loads the email.

### 9.4 Checking if/when it was opened

1. Go to `https://[your-app].up.railway.app/dashboard?key=[your-DASHBOARD_SECRET-value]` — bookmark this exact URL (with your secret key included) so you don't have to retype it each time.
2. You'll see the list view: every tracked email, recipient, sent time, and current open count.
3. Click into any email to see the full detail view — every individual open event, with timestamp, approximate location, and device/client info.
4. Refresh the page any time to see updated counts — there's no auto-refresh/live-updating in v1, so you'll need to manually reload if you're watching for a fresh open in real time.

### 9.5 Ongoing usage — what you do and don't need to repeat

**You do NOT need to repeat, ever again (after initial setup):**
- Railway account creation, project setup, environment variables, database migration — all one-time.
- Chrome extension loading — stays active across Gmail sessions and browser restarts, as long as you don't manually remove it from `chrome://extensions`.

**You DO need to do, every time you want to check something:**
- Just revisit your bookmarked dashboard URL — that's it. No re-login, no re-setup.

**You might occasionally need to:**
- Re-generate the Railway domain if it ever changes (rare, but if it does, update the URL constant in `content-script.js` and reload the unpacked extension).
- Re-run `railway run npx prisma migrate deploy` only if you (or Antigravity, in a future update) change the database schema later.
- Keep an eye on Railway's usage dashboard occasionally just to confirm you're staying within free credit — at <100 emails/month this should never realistically become a concern, but it costs nothing to glance at it monthly.

### 9.6 Quick troubleshooting reference

| Symptom | Likely cause |
|---|---|
| Extension shows "disconnected" | Railway app URL in `content-script.js` doesn't match your actual deployed domain, or the Railway service is down/sleeping (shouldn't happen on Railway, unlike Render) |
| Dashboard shows emails but 0 opens, even after you confirmed the recipient opened it | Recipient's email client blocked remote images by default (common — Gmail itself sometimes does this until "Display images below" is clicked); this is a known limitation, not a bug |
| Every open shows the same generic location (e.g. "Mountain View, CA") | This is Google's own image-proxy server if the recipient is also on Gmail — expected behavior, documented in Section 6.4 of this PRD |
| Dashboard URL says "unauthorized" or similar | You forgot the `?key=[your-DASHBOARD_SECRET-value]` in the URL, or it doesn't match the Railway environment variable exactly |
