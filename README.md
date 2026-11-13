# Distro V2

Cross-platform hybrid app for Facebook group post scheduling. Runs as an installable **PWA** on Windows/Mac (Chrome/Edge), Android Chrome, and iOS Safari — backed by **Vercel Serverless API** + **Turso (LibSQL)**, with Chrome Extension sync and Meta OAuth.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- Progressive Web App (manifest + service worker)
- Vercel Serverless functions (`/api`)
- Turso / LibSQL with in-memory fallback for local demos
- Chrome Extension pairing via 6-digit code + `x-pairing-code` header

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Without Turso credentials the API/data layer uses an in-memory store so the UI works immediately.

## Environment

| Variable | Purpose |
|----------|---------|
| `TURSO_DATABASE_URL` | Turso LibSQL URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `META_APP_ID` | Meta / Facebook app id |
| `META_APP_SECRET` | Meta app secret |
| `META_REDIRECT_URI` | OAuth callback (`https://your-app.vercel.app/api/auth/meta/callback`) |
| `VITE_APP_URL` | Public app origin (local or production) |

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add the env vars from `.env.example`.
4. Deploy. Framework preset: **Vite**.

```bash
npm run build
```

## Install as a native-feeling app

### Windows / Mac (Chrome or Edge)

1. Open the deployed URL.
2. Use **Install app** / the install icon in the address bar.
3. Distro V2 opens in its own window (standalone display).

### Android (Chrome)

1. Open the site in Chrome.
2. Tap **Add to Home screen** / **Install app**.
3. Launch from the home screen icon.

### iPhone / iPad (Safari)

1. Open the site in Safari.
2. Tap **Share → Add to Home Screen**.
3. Confirm. Safe-area insets keep content clear of the notch and home indicator.

## Chrome Extension sync

1. Open **Settings** in Distro V2 and copy your **6-digit pairing code**.
2. In the Distro Chrome Extension (PC Chrome, or Android Kiwi / Mises), paste the code.
3. The extension `POST`s groups to `/api/sync-groups` with header:

```http
x-pairing-code: 123456
Content-Type: application/json
```

Body shape:

```json
{
  "groups": [
    {
      "name": "React Developers IL",
      "fbGroupId": "123456789",
      "url": "https://www.facebook.com/groups/123456789",
      "memberCount": 12400,
      "avatarUrl": "https://..."
    }
  ]
}
```

Health check: `GET /api/health`

## Meta OAuth

- Start: `GET /api/auth/meta`
- Callback: `GET /api/auth/meta/callback`
- Works in desktop browsers, Android Chrome, and iOS Safari (full-page redirect flow).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript only |

## App structure

```
api/           Vercel serverless (db, sync, Meta OAuth)
shared/        Shared TypeScript types
src/pages/     Timing, Groups, Settings
src/components Adaptive shell (sidebar + mobile bottom nav)
public/        PWA icons & favicon
```
