# Personal Calendar

A tiny, private calendar for your phone. Open the site, type something like
"Training Friday at 18:00", check the preview, tap **Add event** — it's saved
and shows up in Apple Calendar via a private subscription feed.

No React, no build step, no npm install. It's one HTML page (Tailwind loaded
from a CDN) plus a couple of plain JS files, served by a Node script that uses
nothing beyond what Node ships with.

Sync direction is one-way: **website → Apple Calendar.** Editing an event in
Apple Calendar does not change anything here.

## How it works

1. You type a request in plain English into the textarea, in your browser.
2. `public/parse.js` — a small hand-written pattern matcher, not AI — turns it
   into a title, date, time (or all-day), duration, and location guess.
3. You get an **editable** preview: date/time/title/location fields
   pre-filled with the guess. Fix anything it got wrong, then confirm.
4. `server.js` saves it to a JSON file (`data/store.json`).
5. All saved events are exposed at a private, token-protected `.ics` URL that
   Apple Calendar (or Google Calendar, Outlook, etc.) can subscribe to.

There's no OpenAI key, no server-side secret to configure, nothing to sign up
for. The only thing worth protecting is the calendar subscription link itself
(see Security below).

## Running it

Requires Node 18+. No `npm install` needed.

```bash
node server.js
# or: npm start
```

Open [http://localhost:3000](http://localhost:3000) — on your phone too, if
it's on the same network as whatever machine is running the server (use that
machine's local IP instead of `localhost`, e.g. `http://192.168.1.23:3000`).

Optional environment variables:

```bash
PORT=8080 node server.js
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. |

There's no timezone setting to configure — the browser's own local time is
used for everything, both when parsing what you type and when displaying
events, so it's always correct for whatever device you're using.

## What the parser understands

It's regex-based, not AI, so it only recognizes patterns it's explicitly
coded for:

- **Dates:** today, tomorrow, day after tomorrow, yesterday, a bare weekday
  ("Friday"), "next Friday", "this weekend", "next week", a month + day
  ("September 12", "12th of September"), optionally with a year.
- **Times:** "8pm", "8:30pm", "20:00", or a bare "at 7" (→ 07:00). No time at
  all → the event is created as all-day.
- **Durations:** "for 90 minutes", "for 3 hours", "for about 2 hours", "for
  half an hour". No duration given → defaults to 60 minutes.
- **Location:** a capitalized word (or words) after "to"/"in"/"at" — e.g.
  "Go to Rotterdam" → location "Rotterdam". Best-effort; fix it in the
  preview if it's wrong or missing.

It does **not** understand recurring events ("every Monday") — it'll create a
single occurrence on the next matching date and ignore the "every".

Because the parser is simple, the preview screen is always editable — treat
its guess as a starting point, not a final answer.

## How the Apple Calendar subscription works

On first run, the server generates a random 32-byte token
(`crypto.randomBytes(32)`) and stores it once in `data/store.json` — it's not
regenerated on restart. That token is the only thing protecting your feed, so
**treat the subscription URL like a secret.**

`GET /api/calendar/<token>` checks the token against the stored value (404 if
it doesn't match) and returns a hand-built RFC 5545 `.ics` feed
(`lib/ics.js`). Each event's id is reused as its calendar UID, so
re-subscribing or refreshing never creates duplicates. Timed events are
written as absolute UTC instants; all-day events use date-only values with a
correctly exclusive `DTEND` (the day after the last day), per spec.

To subscribe on an Apple device:

1. Open the Apple Calendar card on the site and copy the URL (or tap
   **Subscribe to Calendar**).
2. On iPhone/iPad/Mac: **Settings → Calendar → Accounts → Add Account →
   Other → Add Subscribed Calendar**, then paste the URL.
3. New events show up the next time Apple refreshes the subscription — Apple
   controls that interval, it isn't instant.

This is one-way. There's no API for a self-hosted app to receive push updates
from Apple Calendar, so changes made there are never read back here.

## Data

Everything lives in `data/store.json` (created automatically, gitignored):
your events and the feed token. Back it up if you care about what's in it —
there's no other copy.

## Deployment

Works as-is on anything with a persistent disk and Node 18+ — a small VPS,
a Raspberry Pi on your home network, etc. Run it behind a reverse proxy
(Caddy, nginx) with TLS if you expose it beyond your LAN, and keep it running
with something like `pm2` or a systemd service so it survives reboots.

Avoid serverless/ephemeral-filesystem platforms (Vercel, etc.) — `data/`
needs to persist between requests, and those platforms don't guarantee that.

## Security

- There is **no authentication** on the site itself — anyone who can reach
  the URL can add events. Fine for a phone on your own network or a private
  VPN; before exposing it on the open internet, put something in front of
  it — HTTP basic auth via your reverse proxy, or a VPN/Tailscale.
- The calendar feed token is cryptographically random and generated once.
  Don't share the subscription URL.
- `data/` is gitignored — don't commit it.

## Project structure

```
server.js          Node http server: static files + API routes, zero deps
lib/
  store.js          JSON-file storage (events, feed token)
  ics.js             hand-rolled RFC 5545 .ics builder
public/
  index.html         the whole UI
  parse.js           natural-language parser (no AI)
  app.js             UI wiring: interpret, editable preview, fetch calls
data/                created on first run (gitignored)
```

## API

| Route | Method | Description |
| --- | --- | --- |
| `/api/events` | GET | List saved events. |
| `/api/events` | POST | Create an event (validated: title, start/end required, end ≥ start). |
| `/api/feed-url` | GET | The private `.ics` subscription URL. |
| `/api/calendar/<token>` | GET | The `.ics` feed itself. 404 on a bad token. |

## What's not built (by design)

- Editing/deleting events, recurring events, reminders
- Any AI — the parser is intentionally hand-written and simple
- Authentication
