(function () {
  "use strict";

  const textEl = document.getElementById("event-text");
  const interpretBtn = document.getElementById("interpret-btn");
  const noticeEl = document.getElementById("notice");

  const previewEl = document.getElementById("preview");
  const titleEl = document.getElementById("preview-title");
  const dateEl = document.getElementById("preview-date");
  const allDayEl = document.getElementById("preview-allday");
  const timeRowEl = document.getElementById("preview-time-row");
  const startEl = document.getElementById("preview-start");
  const durationEl = document.getElementById("preview-duration");
  const locationEl = document.getElementById("preview-location");
  const confirmBtn = document.getElementById("confirm-btn");
  const cancelBtn = document.getElementById("cancel-btn");

  const subscribeLink = document.getElementById("subscribe-link");
  const feedUrlEl = document.getElementById("feed-url");
  const copyBtn = document.getElementById("copy-btn");

  const eventsListEl = document.getElementById("events-list");

  let noticeTimeout = null;

  function showNotice(type, message) {
    clearTimeout(noticeTimeout);
    noticeEl.textContent = message;
    noticeEl.className =
      "mt-5 rounded-2xl border px-4 py-3 text-sm " +
      (type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-rose-200 bg-rose-50 text-rose-800");
    noticeTimeout = setTimeout(() => noticeEl.classList.add("hidden"), 5000);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateToInputValue(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function timeToInputValue(hour, minute) {
    return `${pad(hour)}:${pad(minute)}`;
  }

  // ---- Interpret ----

  function interpret() {
    const text = textEl.value.trim();
    if (!text) return;

    const parsed = window.NLParser.parse(text, new Date());

    titleEl.value = parsed.title;
    dateEl.value = dateToInputValue(parsed.date);
    allDayEl.checked = !parsed.hasTime;
    startEl.value = parsed.hasTime
      ? timeToInputValue(parsed.hour, parsed.minute)
      : "09:00";
    durationEl.value = String(parsed.durationMinutes);
    locationEl.value = parsed.location;

    updateAllDayVisibility();
    previewEl.classList.remove("hidden");
    previewEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    titleEl.focus();
  }

  function updateAllDayVisibility() {
    timeRowEl.classList.toggle("hidden", allDayEl.checked);
  }

  allDayEl.addEventListener("change", updateAllDayVisibility);
  interpretBtn.addEventListener("click", interpret);

  textEl.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      interpret();
    }
  });

  document.querySelectorAll(".example-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      textEl.value = btn.textContent.trim();
      textEl.focus();
    });
  });

  // ---- Confirm / cancel ----

  cancelBtn.addEventListener("click", () => {
    previewEl.classList.add("hidden");
  });

  confirmBtn.addEventListener("click", async () => {
    const title = titleEl.value.trim();
    if (!title) {
      showNotice("error", "Give the event a title first.");
      titleEl.focus();
      return;
    }
    if (!dateEl.value) {
      showNotice("error", "Pick a date first.");
      return;
    }

    const allDay = allDayEl.checked;
    let start, end;

    if (allDay) {
      start = dateEl.value;
      end = dateEl.value;
    } else {
      const [y, m, d] = dateEl.value.split("-").map(Number);
      const [h, min] = (startEl.value || "09:00").split(":").map(Number);
      const startDate = new Date(y, m - 1, d, h, min, 0, 0);
      const minutes = Number(durationEl.value) || 60;
      const endDate = new Date(startDate.getTime() + minutes * 60000);
      start = startDate.toISOString();
      end = endDate.toISOString();
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Adding…";

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start,
          end,
          allDay,
          location: locationEl.value.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showNotice("error", data.error || "Couldn't save the event.");
        return;
      }

      previewEl.classList.add("hidden");
      textEl.value = "";
      showNotice("success", "Event added to your calendar.");
      loadEvents();
    } catch {
      showNotice("error", "Couldn't reach the server. Try again.");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Add event";
    }
  });

  // ---- Apple Calendar feed ----

  async function loadFeedUrl() {
    try {
      const res = await fetch("/api/feed-url");
      const data = await res.json();
      feedUrlEl.value = data.url;
      subscribeLink.href = data.url;
      subscribeLink.classList.remove("pointer-events-none", "bg-slate-300");
      subscribeLink.classList.add("bg-indigo-600", "hover:bg-indigo-500");
    } catch {
      feedUrlEl.value = "Couldn't load the link.";
    }
  }

  copyBtn.addEventListener("click", async () => {
    if (!feedUrlEl.value || feedUrlEl.value.startsWith("Loading")) return;
    try {
      await navigator.clipboard.writeText(feedUrlEl.value);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = original), 2000);
    } catch {
      showNotice("error", "Couldn't copy the link.");
    }
  });

  // ---- Upcoming events ----

  function isDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function formatDateLabel(value) {
    let date;
    if (isDateOnly(value)) {
      const [y, m, d] = value.split("-").map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(value);
    }
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function formatTimeLabel(value) {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderEvents(events) {
    if (!events.length) {
      eventsListEl.innerHTML =
        '<p class="p-5 text-sm text-slate-400">Nothing scheduled yet.</p>';
      return;
    }

    eventsListEl.innerHTML = events
      .map((event) => {
        const when = event.allDay
          ? `${formatDateLabel(event.start)} &middot; All day`
          : `${formatDateLabel(event.start)} &middot; ${formatTimeLabel(event.start)}&ndash;${formatTimeLabel(event.end)}`;
        const location = event.location
          ? `<p class="mt-0.5 text-sm text-slate-400">${escapeHtml(event.location)}</p>`
          : "";

        return `
          <div class="border-b border-slate-100 px-5 py-4 last:border-b-0">
            <p class="font-medium text-slate-900">${escapeHtml(event.title)}</p>
            <p class="mt-0.5 text-sm text-slate-500">${when}</p>
            ${location}
          </div>
        `;
      })
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadEvents() {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      renderEvents(data.events || []);
    } catch {
      eventsListEl.innerHTML =
        '<p class="p-5 text-sm text-rose-500">Couldn\'t load events.</p>';
    }
  }

  loadEvents();
  loadFeedUrl();
})();
