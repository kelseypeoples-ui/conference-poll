# Conference Poll — Real-Time Country Map

A lightweight real-time conference poll. Attendees scan a QR code, pick their country from a searchable dropdown, and a big-screen display shows a live world map with bubbles and a Top 10 leaderboard — all updated in real time.

**No Firebase. No build step. Just Node.js.**

---

## Architecture

```
Attendee Phone                 Node.js Server              Projector Screen
┌───────────────┐        ┌─────────────────────┐     ┌──────────────────────────────┐
│ /submit.html   │───────▶│  Express + Socket.IO │◀────│ /display.html?event=CODE     │
│  ?event=CODE   │ POST   │  In-memory store     │  WS │                              │
│                │ /api/  │  per event           │     │ [QR Code] [Map] [Leaderboard]│
│ Searchable     │        │                      │     │                              │
│  dropdown      │        │  Broadcasts new      │────▶│ Real-time bubble updates     │
│                │        │  submissions via WS   │     │                              │
└───────────────┘        └─────────────────────┘     └──────────────────────────────┘
```

**Data store:** In-memory (no database). Data persists while the server runs. Restart clears all data. This is intentional — conference polls are ephemeral.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or newer

### Install & Run

```bash
cd conference-poll
npm install
npm start
```

The server starts on **http://localhost:3000** by default.

Set a custom port:
```bash
PORT=8080 npm start
```

### URLs

| Page | URL | Purpose |
|------|-----|---------|
| Submit | `http://localhost:3000/submit.html?event=DEMO` | Mobile — attendees pick their country |
| Display | `http://localhost:3000/display.html?event=DEMO` | Projector — QR code + map + leaderboard |

The `event` parameter isolates data per conference. Use any alphanumeric code (3–32 chars, hyphens/underscores allowed).

---

## Display Layout

The display page is a three-panel layout designed for projectors:

```
┌──────────┬─────────────────────────────┬──────────────┐
│          │                             │              │
│  QR Code │      World Map              │  Top 10      │
│          │      (Leaflet + CARTO Dark) │  Leaderboard │
│  Submit  │                             │              │
│   URL    │      Bubbles at capitals    │  Rank, Name  │
│          │      sized by count         │  Count, Bar  │
│  Event   │                             │              │
│  Code    │      Declutter algo for     │  Color       │
│          │      overlapping capitals   │  swatches    │
│  Total   │                             │              │
│  Count   │                             │              │
└──────────┴─────────────────────────────┴──────────────┘
```

The QR code is auto-generated from the submit URL, so attendees can scan it directly from the projected screen.

---

## How It Works

### Real-Time Flow

1. Attendee opens `/submit.html?event=CODE` (via QR scan)
2. Picks country from searchable dropdown, hits Submit
3. Browser POSTs to `/api/submit` on the Node server
4. Server stores in memory, broadcasts via Socket.IO to all display clients
5. Display page updates map bubbles and leaderboard instantly

### Bubble Sizing

Radius = `R0 + K × sqrt(count)` where `R0 = 8px`, `K = 4`.

### Deterministic Color (ISO2 → HSL)

1. Hash: `iso2.charCodeAt(0) × 256 + iso2.charCodeAt(1)`
2. Hue: `(hash × 137.508) % 360` — golden-angle spacing for max separation
3. Saturation 75%, Lightness 52% — vivid but projector-safe
4. Label color: white or black based on fill luminance

### Declutter Algorithm

Nearby capitals (e.g. Brazzaville/Kinshasa) get offset using:
- Pixel-space overlap detection via union-find
- Concentric ring placement, sorted by ISO2 for stability
- Re-runs on zoom changes and data updates

---

## API Endpoints

### POST /api/submit

Submit a country for an event.

```json
{
  "eventId": "DEMO",
  "iso2": "US",
  "countryName": "United States"
}
```

Response: `{ "ok": true }`

### GET /api/event/:eventId

Get current aggregated counts.

Response:
```json
{
  "counts": [
    { "iso2": "US", "countryName": "United States", "count": 5 },
    { "iso2": "DE", "countryName": "Germany", "count": 3 }
  ],
  "total": 8
}
```

---

## Deployment Options

### Local Network (simplest for conferences)

1. Run on a laptop connected to the venue Wi-Fi
2. Find your local IP: `ifconfig` (macOS) or `ipconfig` (Windows)
3. Attendees connect to `http://YOUR_IP:3000/submit.html?event=CONF2026`
4. Open display on the projector laptop's browser

### Cloud (persistent)

Deploy to any Node.js host (Railway, Render, Fly.io, DigitalOcean, etc.):

```bash
# Example with Railway
railway up
```

Or with Docker:
```bash
docker build -t conference-poll .
docker run -p 3000:3000 conference-poll
```

---

## QR Code

The display page auto-generates a QR code pointing to the submit URL. You can also generate standalone QR codes:

- **qr-server.com:** `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=http://YOUR_IP:3000/submit.html?event=CONF`
- Print it on slides, table tents, or badge inserts

---

## Conference-Day Tips

1. **Pre-test 30 minutes early.** Submit 2–3 entries to verify everything works.

2. **Use Chrome fullscreen** for the projector: press F11 on the display page.

3. **Stable Wi-Fi matters.** Both submit and display pages need connectivity to the server.

4. **Backup event code.** If something goes wrong, switch to a new event code instantly.

5. **Multiple displays.** Open `/display.html?event=CODE` on multiple screens — they all get real-time updates.

6. **Data is ephemeral.** Restarting the server clears all data. This is by design for single-event use.

---

## Project Structure

```
conference-poll/
├── server.js              Express + Socket.IO server
├── package.json           Dependencies
├── public/
│   ├── submit.html        Mobile submission page
│   ├── display.html       Projector 3-panel display
│   ├── css/
│   │   ├── common.css     Shared variables & reset
│   │   ├── submit.css     Submit page styles
│   │   └── display.css    Display page styles
│   └── js/
│       ├── countries.js   196 countries with capital coordinates
│       ├── submit.js      Autocomplete + submission logic
│       └── display.js     Map, QR, declutter, leaderboard
└── README.md              This file
```

## Dependencies

- **express** — HTTP server
- **socket.io** — Real-time WebSocket communication
- **Leaflet 1.9** (CDN) — Map rendering
- **qrcode** (CDN) — QR code generation
- **CARTO Dark** tiles — Dark basemap, free, no API key
