const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const EVENT_RE = /^[A-Za-z0-9_-]{3,32}$/;
const ISO2_RE = /^[A-Z]{2}$/;

// ── In-Memory Store ─────────────────────────────────────────────────────────
// Map<eventId, Array<{ iso2, countryName, timestamp }>>
const events = new Map();

function getEvent(eventId) {
  if (!events.has(eventId)) events.set(eventId, []);
  return events.get(eventId);
}

function aggregateCounts(submissions) {
  const counts = new Map();
  for (const s of submissions) {
    const existing = counts.get(s.iso2);
    if (existing) {
      existing.count++;
    } else {
      counts.set(s.iso2, { iso2: s.iso2, countryName: s.countryName, count: 1 });
    }
  }
  return [...counts.values()];
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── API Routes ──────────────────────────────────────────────────────────────

// Submit a country
app.post("/api/submit", (req, res) => {
  const { eventId, iso2, countryName } = req.body;

  if (!eventId || !EVENT_RE.test(eventId))
    return res.status(400).json({ error: "Invalid event code" });
  if (!iso2 || !ISO2_RE.test(iso2))
    return res.status(400).json({ error: "Invalid ISO2 code" });
  if (!countryName || typeof countryName !== "string" || countryName.length > 100)
    return res.status(400).json({ error: "Invalid country name" });

  const submission = { iso2, countryName, timestamp: Date.now() };
  getEvent(eventId).push(submission);

  // Broadcast to all display clients watching this event
  io.to(`event:${eventId}`).emit("submission", {
    submission,
    counts: aggregateCounts(getEvent(eventId)),
    total: getEvent(eventId).length
  });

  res.json({ ok: true });
});

// Get current state for an event (used on display page initial load)
app.get("/api/event/:eventId", (req, res) => {
  const { eventId } = req.params;
  if (!EVENT_RE.test(eventId))
    return res.status(400).json({ error: "Invalid event code" });

  const submissions = getEvent(eventId);
  res.json({
    counts: aggregateCounts(submissions),
    total: submissions.length
  });
});

// ── Socket.IO ───────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("join-event", (eventId) => {
    if (EVENT_RE.test(eventId)) {
      socket.join(`event:${eventId}`);
    }
  });
});

// ── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Conference Poll running at http://localhost:${PORT}`);
  console.log(`  Submit: http://localhost:${PORT}/submit.html?event=DEMO`);
  console.log(`  Display: http://localhost:${PORT}/display.html?event=DEMO`);
});
