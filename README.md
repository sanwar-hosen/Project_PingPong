# PingPong 🏓

**Self-hosted, zero-paywall Gmail email open tracker.**

PingPong replaces paid third-party Gmail tracking add-ons with a fully self-hosted system: a Chrome extension injects an invisible tracking pixel into every email you send, and a lightweight backend logs every open with timestamp, approximate location, and device info.

---

## Project Structure

```
Project_PingPong/
├── server/          # Node.js + Express backend (hosted on Railway)
├── extension/       # Chrome Extension (Manifest V3, loaded unpacked)
├── docker-compose.yml
└── README.md
```

---

## Quick Start (Local Development)

### Prerequisites
- [Node.js 20 LTS](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Postgres)
- [Railway CLI](https://docs.railway.app/develop/cli) (for production deployment)

### 1. Start local Postgres

```bash
docker-compose up -d
```

This starts a Postgres instance at `localhost:5432` (database: `pingpong`, user: `pingpong`, password: `pingpong`).

### 2. Configure environment

```bash
cd server
cp .env.example .env
# Edit .env and set your DASHBOARD_SECRET to a long random string
```

### 3. Install dependencies & run migrations

```bash
cd server
npm install
npm run db:migrate
```

### 4. Start the development server

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

### 5. Test the pixel endpoint

Visit `http://localhost:3000/pixel/test-tracking-id.gif` in your browser. You should see a blank 1×1 image. Check your database — a new `OpenEvent` row should appear.

### 6. Test the email pre-registration endpoint

```bash
curl -X POST http://localhost:3000/api/emails \
  -H "Content-Type: application/json" \
  -d '{"trackingId":"test-tracking-id","subject":"Hello World","recipient":"someone@example.com"}'
```

---

## Production Deployment (Railway)

See [server/README.md](./server/README.md) and the full setup guide in the PRD (`Docs/Email-Tracker-PRD.md`, Section 9).

**Short version:**
1. Push `server/` to a GitHub repo
2. Create a Railway project → Deploy from GitHub → Add Postgres plugin
3. Set env vars: `DATABASE_URL` (auto-linked), `DASHBOARD_SECRET`, `BASE_URL`
4. Run migration: `railway run npx prisma migrate deploy`
5. Generate a domain in Railway Settings → use that domain in `extension/content-script.js`

---

## Chrome Extension

See `extension/` folder (populated in Phase 2). Load as an unpacked extension from `chrome://extensions` with Developer Mode enabled.

---

## Dashboard

After deployment, access your dashboard at:

```
https://[your-app].up.railway.app/dashboard?key=[your-DASHBOARD_SECRET]
```

Bookmark this URL (with the key) — it's your only access credential.

---

## Known Limitations

- **Gmail-to-Gmail opens** show Google's proxy server location, not the recipient's real IP — this is a universal pixel tracking limitation.
- **Image blocking** — "opened" means the recipient's client loaded the remote image. Clients that block images by default won't register until the user clicks "show images."
- **Apple Mail Privacy Protection (MPP)** pre-fetches images regardless of whether the email was actually read — may produce false-positive opens for Apple Mail users.

---

## License

Private project — no external license.
