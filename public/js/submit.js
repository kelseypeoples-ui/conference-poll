(function () {
  "use strict";

  const EVENT_RE = /^[A-Za-z0-9_-]{3,32}$/;
  const params   = new URLSearchParams(location.search);
  const eventId  = (params.get("event") || "").trim();

  const errorView = document.getElementById("error-view");
  const formView  = document.getElementById("form-view");

  if (!EVENT_RE.test(eventId)) {
    errorView.style.display = "";
    if (eventId)
      document.getElementById("error-msg").textContent =
        '"' + eventId + '" is not a valid event code. Use 3\u201332 letters, digits, hyphens, or underscores.';
    return;
  }

  formView.style.display = "";
  document.getElementById("event-label").textContent = eventId;

  // ── Autocomplete ────────────────────────────────────────────────────────
  const input      = document.getElementById("country-input");
  const listEl     = document.getElementById("country-list");
  const submitBtn  = document.getElementById("submit-btn");
  const feedbackEl = document.getElementById("feedback");
  const cooldownEl = document.getElementById("cooldown");

  var selected   = null;
  var activeIdx  = -1;
  var filtered   = [];
  var submitting = false;

  function escHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function renderList(items, query) {
    listEl.innerHTML = "";
    filtered = items;
    activeIdx = -1;
    if (!items.length) { closeList(); return; }

    var lowerQ = query.toLowerCase();
    items.forEach(function (c, i) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.index = i;

      var idx = c.name.toLowerCase().indexOf(lowerQ);
      if (idx >= 0 && lowerQ) {
        li.innerHTML =
          escHtml(c.name.slice(0, idx)) +
          '<span class="match">' + escHtml(c.name.slice(idx, idx + lowerQ.length)) + '</span>' +
          escHtml(c.name.slice(idx + lowerQ.length));
      } else {
        li.textContent = c.name;
      }

      li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(c); });
      listEl.appendChild(li);
    });
    listEl.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  }

  function closeList() {
    listEl.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
    activeIdx = -1;
  }

  function pick(country) {
    selected = country;
    input.value = country.name;
    submitBtn.disabled = false;
    closeList();
  }

  function clearSelection() {
    selected = null;
    submitBtn.disabled = true;
  }

  input.addEventListener("input", function () {
    clearSelection();
    var q = input.value.trim();
    if (!q) { closeList(); return; }
    var lower = q.toLowerCase();
    var matches = COUNTRIES.filter(function (c) {
      return c.name.toLowerCase().includes(lower);
    });
    matches.sort(function (a, b) {
      var aP = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      var bP = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      return aP - bP || a.name.localeCompare(b.name);
    });
    renderList(matches.slice(0, 50), q);
  });

  input.addEventListener("keydown", function (e) {
    if (!listEl.classList.contains("open")) return;
    var items = listEl.children;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      updateActive(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      updateActive(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      closeList();
    }
  });

  function updateActive(items) {
    Array.from(items).forEach(function (li, i) {
      li.classList.toggle("active", i === activeIdx);
    });
    if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete-wrap")) closeList();
  });

  // ── Submit ──────────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", function () {
    if (!selected || submitting) return;
    submitting = true;
    submitBtn.disabled = true;
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: eventId,
        iso2: selected.iso2,
        countryName: selected.name
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        feedbackEl.textContent = selected.name + " submitted!";
        feedbackEl.className = "feedback success";
        input.value = "";
        clearSelection();
        startCooldown(12);
      })
      .catch(function (err) {
        feedbackEl.textContent = "Something went wrong. Please try again.";
        feedbackEl.className = "feedback error";
        submitBtn.disabled = false;
      })
      .finally(function () {
        submitting = false;
      });
  });

  function startCooldown(seconds) {
    var remaining = seconds;
    submitBtn.disabled = true;
    cooldownEl.textContent = "Please wait " + remaining + "s before submitting again";
    var timer = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        cooldownEl.textContent = "";
        submitBtn.disabled = !selected;
      } else {
        cooldownEl.textContent = "Please wait " + remaining + "s before submitting again";
      }
    }, 1000);
  }
})();
