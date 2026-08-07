"use strict";

function escapeText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

// RFC 5545 requires folding lines longer than 75 octets; continuation
// lines start with a single space.
function foldLine(line) {
  if (line.length <= 75) return line;

  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "2026-08-08T18:00:00.000Z" -> "20260808T180000Z"
function formatUtcStamp(isoString) {
  const d = new Date(isoString);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// "2026-08-20" -> "20260820"
function dateOnlyDigits(dateOnly) {
  return dateOnly.replaceAll("-", "");
}

// "2026-08-20" -> "2026-08-21" (UTC-safe, no timezone involved)
function addOneDay(dateOnly) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return (
    next.getUTCFullYear() +
    "-" +
    pad(next.getUTCMonth() + 1) +
    "-" +
    pad(next.getUTCDate())
  );
}

function buildIcs(events, calendarName) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//personal-calendar//EN",
    "CALSCALE:GREGORIAN",
    `NAME:${escapeText(calendarName)}`,
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}`);
    lines.push(`DTSTAMP:${formatUtcStamp(event.created_at)}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnlyDigits(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnlyDigits(addOneDay(event.end))}`);
      lines.push("X-MICROSOFT-CDO-ALLDAYEVENT:TRUE");
    } else {
      lines.push(`DTSTART:${formatUtcStamp(event.start)}`);
      lines.push(`DTEND:${formatUtcStamp(event.end)}`);
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

module.exports = { buildIcs };
