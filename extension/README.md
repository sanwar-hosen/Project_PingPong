# extension/

This folder contains the Chrome Extension (Manifest V3) built in **Phase 2**.

## Included Files
- `manifest.json` — Extension manifest config for `mail.google.com` permissions.
- `content-script.js` — Core DOM script that intercepts Gmail "Send" triggers, generates tracking IDs, appends invisible 1x1 GIF pixels, and triggers background metadata registration.
- `background.js` — Service worker that proxies API calls to the server to bypass Gmail CSP and CORS constraints.
- `popup.html` / `popup.js` — Sleek popup UI for displaying connection status and launching the dashboard.
- `icons/` — Generated icons (16px, 48px, 128px PNG).

## How to Install (Local Dev Mode)
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select this `extension` folder.
5. The PingPong extension icon will now appear in your browser bar.

## Manual Updates for Go-Live (Phase 6)
When deploying to Railway:
1. Open `content-script.js` and change `BASE_URL` to your production domain (e.g. `https://your-app.up.railway.app`).
2. Open `popup.js` and change `BASE_URL` to your production domain, and update `DASHBOARD_SECRET` to match the secret set in your Railway environment variables.
3. Go back to `chrome://extensions` and click the **Reload** icon on the PingPong card to apply the changes.
