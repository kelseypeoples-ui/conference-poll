(function () {
  "use strict";

  // ── Event Validation ────────────────────────────────────────────────────
  var EVENT_RE = /^[A-Za-z0-9_-]{3,32}$/;
  var params   = new URLSearchParams(location.search);
  var eventId  = (params.get("event") || "").trim();

  if (!EVENT_RE.test(eventId)) {
    document.getElementById("error-view").style.display = "";
    if (eventId)
      document.getElementById("error-msg").textContent =
        '"' + eventId + '" is not a valid event code.';
    return;
  }

  document.getElementById("display-view").style.display = "";
  document.getElementById("event-title").textContent = eventId;

  // ── Constants ───────────────────────────────────────────────────────────
  var R0 = 8;
  var K  = 4;
  var OVERLAP_PX = 24;
  var RING_BASE  = 20;
  var RING_STEP  = 16;

  var COUNTRY_MAP = {};
  COUNTRIES.forEach(function (c) { COUNTRY_MAP[c.iso2] = c; });

  // ── Color System ────────────────────────────────────────────────────────

  function iso2ToHue(iso2) {
    var hash = iso2.charCodeAt(0) * 256 + iso2.charCodeAt(1);
    return (hash * 137.508) % 360;
  }

  function iso2ToColor(iso2) {
    return "hsl(" + iso2ToHue(iso2) + ", 75%, 52%)";
  }

  function iso2ToHSLValues(iso2) {
    return { h: iso2ToHue(iso2), s: 75, l: 52 };
  }

  function labelColor(iso2) {
    var hsl = iso2ToHSLValues(iso2);
    var h = hsl.h, s = hsl.s, l = hsl.l;
    var a = s / 100 * Math.min(l / 100, 1 - l / 100);
    function f(n) {
      var k = (n + h / 30) % 12;
      return l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    }
    var R = f(0), G = f(8), B = f(4);
    var lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    return lum > 0.45 ? "#111" : "#fff";
  }

  function bubbleRadius(count) {
    return R0 + K * Math.sqrt(count);
  }

  function escHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ── QR Code (server-side image API) ──────────────────────────────────
  var submitUrl = location.origin + "/submit.html?event=" + encodeURIComponent(eventId);
  document.getElementById("qr-url-text").textContent = submitUrl;

  var qrImg = document.createElement("img");
  qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(submitUrl);
  qrImg.width = 200;
  qrImg.height = 200;
  qrImg.alt = "Scan to submit";
  document.getElementById("qr-container").appendChild(qrImg);

  // ── Map Setup ─────────────────────────────────────────────────────────
  var map = L.map("map", {
    center: [20, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: true,
    zoomControl: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  // Force Leaflet to recalculate size after the grid renders
  setTimeout(function () { map.invalidateSize(); }, 200);

  // State
  var markers    = {};
  var counts     = {};
  var prevCounts = {};

  // ── Socket.IO: Real-Time Updates ──────────────────────────────────────
  var socket = io();
  socket.emit("join-event", eventId);

  // Load initial state
  fetch("/api/event/" + encodeURIComponent(eventId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      applyUpdate(data.counts, data.total, true);
    })
    .catch(function (err) {
      console.error("Failed to load initial data:", err);
    });

  socket.on("submission", function (data) {
    applyUpdate(data.counts, data.total, false);
  });

  function applyUpdate(newCountsArr, total, isInit) {
    var changed = {};
    var newCounts = {};

    newCountsArr.forEach(function (entry) {
      newCounts[entry.iso2] = { countryName: entry.countryName, count: entry.count };
      if (!isInit) {
        var prev = prevCounts[entry.iso2];
        if (!prev || prev.count !== entry.count) changed[entry.iso2] = true;
      }
    });

    prevCounts = {};
    Object.keys(newCounts).forEach(function (k) {
      prevCounts[k] = { countryName: newCounts[k].countryName, count: newCounts[k].count };
    });

    counts = newCounts;
    updateMarkers();
    applyDeclutter();
    updateLeaderboard(changed);
    document.getElementById("total-count").textContent = total;
  }

  // ── Marker Management ────────────────────────────────────────────────
  function updateMarkers() {
    var iso2s = Object.keys(counts);

    iso2s.forEach(function (iso2) {
      var entry   = counts[iso2];
      var country = COUNTRY_MAP[iso2];
      if (!country) return;

      var radius = bubbleRadius(entry.count);
      var color  = iso2ToColor(iso2);
      var lColor = labelColor(iso2);

      if (markers[iso2]) {
        var m = markers[iso2];
        m.circle.setRadius(radius);
        m.circle.setStyle({ fillColor: color, color: "#111" });
        m.label.setIcon(makeLabelIcon(entry.count, lColor));
        m.countryName = entry.countryName;
        m.count = entry.count;
      } else {
        var latlng = [country.capLat, country.capLon];

        var circle = L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.85,
          color: "#111",
          weight: 2.5
        }).addTo(map);

        circle.bindPopup(function () {
          var c = counts[iso2];
          return "<strong>" + escHtml(c ? c.countryName : iso2) + "</strong><br>Submissions: " + (c ? c.count : "?");
        });

        var label = L.marker(latlng, {
          icon: makeLabelIcon(entry.count, lColor),
          interactive: false,
          zIndexOffset: 1000
        }).addTo(map);

        markers[iso2] = { circle: circle, label: label, countryName: entry.countryName, count: entry.count };
      }
    });

    Object.keys(markers).forEach(function (iso2) {
      if (!counts[iso2]) {
        map.removeLayer(markers[iso2].circle);
        map.removeLayer(markers[iso2].label);
        delete markers[iso2];
      }
    });
  }

  function makeLabelIcon(count, textColor) {
    return L.divIcon({
      className: "bubble-label",
      html: '<span style="color:' + textColor + '">' + count + '</span>',
      iconSize: [40, 16],
      iconAnchor: [20, 8]
    });
  }

  // ── Declutter / Offset Algorithm ─────────────────────────────────────
  function applyDeclutter() {
    var isoKeys = Object.keys(markers);
    if (!isoKeys.length) return;

    var items = [];
    isoKeys.forEach(function (iso2) {
      var country = COUNTRY_MAP[iso2];
      if (!country) return;
      var origLatLng = L.latLng(country.capLat, country.capLon);
      var pixel = map.latLngToLayerPoint(origLatLng);
      var count = counts[iso2] ? counts[iso2].count : 1;
      var radius = bubbleRadius(count);
      items.push({ iso2: iso2, origLatLng: origLatLng, px: pixel.x, py: pixel.y, radius: radius });
    });

    var parent = {};
    items.forEach(function (it) { parent[it.iso2] = it.iso2; });

    function find(a) {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
      return a;
    }
    function union(a, b) { parent[find(a)] = find(b); }

    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var dx = items[i].px - items[j].px;
        var dy = items[i].py - items[j].py;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var threshold = Math.max(OVERLAP_PX, items[i].radius + items[j].radius);
        if (dist < threshold) union(items[i].iso2, items[j].iso2);
      }
    }

    var groups = {};
    items.forEach(function (it) {
      var root = find(it.iso2);
      if (!groups[root]) groups[root] = [];
      groups[root].push(it);
    });

    Object.keys(groups).forEach(function (root) {
      var group = groups[root];
      group.sort(function (a, b) { return a.iso2.localeCompare(b.iso2); });

      if (group.length === 1) {
        positionMarker(group[0].iso2, group[0].origLatLng);
        return;
      }

      var cx = 0, cy = 0;
      group.forEach(function (it) { cx += it.px; cy += it.py; });
      cx /= group.length;
      cy /= group.length;

      positionMarker(group[0].iso2, map.layerPointToLatLng(L.point(cx, cy)));

      var ringIdx = 0;
      var slotInRing = 0;
      var ringCapacity = 6;

      for (var gi = 1; gi < group.length; gi++) {
        var ringDist = RING_BASE + ringIdx * RING_STEP;
        var angle = (2 * Math.PI * slotInRing) / ringCapacity;
        var ox = cx + ringDist * Math.cos(angle);
        var oy = cy + ringDist * Math.sin(angle);

        positionMarker(group[gi].iso2, map.layerPointToLatLng(L.point(ox, oy)));

        slotInRing++;
        if (slotInRing >= ringCapacity) {
          slotInRing = 0;
          ringIdx++;
          ringCapacity = Math.max(
            Math.floor(2 * Math.PI * (RING_BASE + ringIdx * RING_STEP) / (RING_BASE * 0.9)),
            6
          );
        }
      }
    });
  }

  function positionMarker(iso2, latlng) {
    var m = markers[iso2];
    if (!m) return;
    m.circle.setLatLng(latlng);
    m.label.setLatLng(latlng);
  }

  map.on("zoomend", function () {
    applyDeclutter();
  });

  // ── Leaderboard ──────────────────────────────────────────────────────
  function updateLeaderboard(changed) {
    var sorted = Object.keys(counts).map(function (iso2) {
      return { iso2: iso2, countryName: counts[iso2].countryName, count: counts[iso2].count };
    });

    sorted.sort(function (a, b) {
      return b.count - a.count || a.countryName.localeCompare(b.countryName);
    });

    var top10 = sorted.slice(0, 10);
    var maxCount = top10.length ? top10[0].count : 1;

    var ol = document.getElementById("leaderboard");
    ol.innerHTML = "";

    if (!top10.length) {
      ol.innerHTML = '<li class="leaderboard-empty" style="grid-template-columns:1fr;display:block">Waiting for submissions&hellip;</li>';
      return;
    }

    top10.forEach(function (entry, i) {
      var li = document.createElement("li");
      if (changed[entry.iso2]) {
        li.classList.add("highlight");
        setTimeout(function () { li.classList.remove("highlight"); }, 2500);
      }

      var color = iso2ToColor(entry.iso2);

      li.innerHTML =
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-swatch" style="background:' + color + '"></span>' +
        '<span class="lb-name" title="' + escHtml(entry.countryName) + '">' + escHtml(entry.countryName) + '</span>' +
        '<span class="lb-count">' + entry.count + '</span>' +
        '<div class="lb-bar-track"><div class="lb-bar-fill" style="width:' +
        (entry.count / maxCount * 100).toFixed(1) + '%;background:' + color + '"></div></div>';

      ol.appendChild(li);
    });
  }

})();
