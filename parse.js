// Plain-JS natural language parser. No AI, no network calls — just pattern
// matching against a handful of common phrasings. Runs entirely in the
// browser, using the phone/browser's own local time, so no timezone
// configuration is needed anywhere.
(function () {
  "use strict";

  const WEEKDAYS = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ];
  const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  function addDays(d, n) {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  }

  function weekdayIndex(word) {
    return WEEKDAYS.indexOf(word.toLowerCase());
  }

  function monthIndex(word) {
    const w = word.toLowerCase();
    const full = MONTHS.indexOf(w);
    if (full !== -1) return full;
    return MONTH_ABBR.indexOf(w.slice(0, 3));
  }

  function monthPattern() {
    return "(" + MONTHS.join("|") + "|" + MONTH_ABBR.join("|") + ")";
  }

  function extractDate(text, now) {
    const today = startOfDay(now);
    let m;

    m = /\bday after tomorrow\b/i.exec(text);
    if (m) return { date: addDays(today, 2), match: m };

    m = /\btomorrow\b/i.exec(text);
    if (m) return { date: addDays(today, 1), match: m };

    m = /\btoday\b/i.exec(text);
    if (m) return { date: today, match: m };

    m = /\byesterday\b/i.exec(text);
    if (m) return { date: addDays(today, -1), match: m };

    // "September 12", "Sep 12th, 2026"
    m = new RegExp(
      "\\b" + monthPattern() + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b",
      "i"
    ).exec(text);
    if (m) {
      const mi = monthIndex(m[1]);
      const day = Number(m[2]);
      const year = m[3] ? Number(m[3]) : today.getFullYear();
      let date = new Date(year, mi, day);
      if (!m[3] && date < today) date = new Date(year + 1, mi, day);
      return { date, match: m };
    }

    // "12 September", "12th of September"
    m = new RegExp(
      "\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + monthPattern() + "\\.?(?:,?\\s+(\\d{4}))?\\b",
      "i"
    ).exec(text);
    if (m) {
      const mi = monthIndex(m[2]);
      const day = Number(m[1]);
      const year = m[3] ? Number(m[3]) : today.getFullYear();
      let date = new Date(year, mi, day);
      if (!m[3] && date < today) date = new Date(year + 1, mi, day);
      return { date, match: m };
    }

    m = /\bthis weekend\b/i.exec(text);
    if (m) {
      const offset = (6 - today.getDay() + 7) % 7; // upcoming/today's Saturday
      return { date: addDays(today, offset), match: m };
    }

    m = new RegExp("\\bnext\\s+(" + WEEKDAYS.join("|") + ")\\b", "i").exec(text);
    if (m) {
      const target = weekdayIndex(m[1]);
      let offset = (target - today.getDay() + 7) % 7;
      if (offset === 0) offset = 7; // "next" always means a future occurrence
      return { date: addDays(today, offset), match: m };
    }

    m = /\bnext week\b/i.exec(text);
    if (m) return { date: addDays(today, 7), match: m };

    m = new RegExp("\\b(" + WEEKDAYS.join("|") + ")\\b", "i").exec(text);
    if (m) {
      const target = weekdayIndex(m[1]);
      const offset = (target - today.getDay() + 7) % 7; // includes today
      return { date: addDays(today, offset), match: m };
    }

    return { date: today, match: null };
  }

  function extractTime(text) {
    let m = /\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(text);
    if (m) {
      let hour = Number(m[1]) % 12;
      if (m[3].toLowerCase() === "pm") hour += 12;
      return { hour, minute: m[2] ? Number(m[2]) : 0, match: m };
    }

    m = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
    if (m) return { hour: Number(m[1]), minute: Number(m[2]), match: m };

    m = /\bat\s+(\d{1,2})\b/i.exec(text);
    if (m) {
      const hour = Number(m[1]);
      if (hour <= 23) return { hour, minute: 0, match: m };
    }

    return null;
  }

  function extractDuration(text) {
    const m =
      /\bfor\s+(?:about|around|roughly)?\s*(half\s+an?\s+hour|an?\s+hour|\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h)?\b/i.exec(
        text
      );
    if (!m) return null;

    const raw = m[1].toLowerCase();
    if (raw.includes("half")) return { minutes: 30, match: m };
    if (raw === "an hour" || raw === "a hour") return { minutes: 60, match: m };

    const value = Number(raw);
    const unit = (m[2] || "hours").toLowerCase();
    const minutes = unit.startsWith("h") ? value * 60 : value;
    return { minutes: Math.round(minutes), match: m };
  }

  const LOCATION_STOPWORDS = new Set([
    ...WEEKDAYS, ...MONTHS, ...MONTH_ABBR,
    "tomorrow", "today", "next", "weekend", "yesterday",
  ]);

  function extractLocation(text) {
    const re = /\b(?:to|in|at)\s+([A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*)/gu;
    let m;
    while ((m = re.exec(text))) {
      // Drop trailing words that are actually date words swept up by the
      // capitalized-word grab, e.g. "Rotterdam Monday" -> "Rotterdam".
      const words = m[1].split(/\s+/);
      while (words.length && LOCATION_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
        words.pop();
      }
      if (words.length === 0) continue;
      return { location: words.join(" "), match: m };
    }
    return null;
  }

  function removeRanges(text, ranges) {
    const sorted = ranges.filter(Boolean).sort((a, b) => b.index - a.index);
    let result = text;
    for (const r of sorted) {
      result = result.slice(0, r.index) + " " + result.slice(r.index + r.length);
    }
    return result;
  }

  function cleanTitle(text, fallback) {
    let t = text.replace(/\s+/g, " ").trim();
    t = t.replace(
      /^(every|i need to|i've got to|i have to|i have|need to|remember to|don't forget to)\s+/i,
      ""
    );
    t = t.replace(/^(to|for|on|at|in)\s+/i, "");
    t = t.replace(/\s+(to|for|on|at|in)$/i, "");
    t = t.trim();
    if (!t) t = fallback.trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function parse(text, now) {
    now = now || new Date();
    const trimmed = text.trim();

    const dateResult = extractDate(trimmed, now);
    const timeResult = extractTime(trimmed);
    const durationResult = extractDuration(trimmed);
    const locationResult = extractLocation(trimmed);

    const ranges = [
      dateResult.match && { index: dateResult.match.index, length: dateResult.match[0].length },
      timeResult && { index: timeResult.match.index, length: timeResult.match[0].length },
      durationResult && { index: durationResult.match.index, length: durationResult.match[0].length },
    ];

    const title = cleanTitle(removeRanges(trimmed, ranges), trimmed);

    return {
      title,
      date: dateResult.date,
      hasTime: Boolean(timeResult),
      hour: timeResult ? timeResult.hour : null,
      minute: timeResult ? timeResult.minute : null,
      durationMinutes: durationResult ? durationResult.minutes : 60,
      location: locationResult ? locationResult.location : "",
    };
  }

  window.NLParser = { parse };
})();
