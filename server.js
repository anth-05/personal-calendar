"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { getFeedToken, listEvents, addEvent } = require("./lib/store");
const { buildIcs } = require("./lib/ics");

const PORT = Number(process.env.PORT) || 3000;

const publicDir = path.join(__dirname, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    const limit = 1024 * 1024; // 1MB is plenty for one event

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      data += chunk;
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.normalize(path.join(publicDir, relative));

  // Prevent escaping the public/ directory via "..".
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
    });
    res.end(content);
  });
}

async function handleGetEvents(req, res) {
  sendJson(res, 200, { events: listEvents() });
}

async function handlePostEvents(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const start = typeof body.start === "string" ? body.start.trim() : "";
  const end = typeof body.end === "string" ? body.end.trim() : "";
  const allDay = body.allDay === true;
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  if (!title) {
    sendJson(res, 400, { error: "Title is required." });
    return;
  }
  if (!start || !end) {
    sendJson(res, 400, { error: "Start and end are required." });
    return;
  }

  const startTime = Date.parse(allDay ? `${start}T00:00:00Z` : start);
  const endTime = Date.parse(allDay ? `${end}T00:00:00Z` : end);

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    sendJson(res, 400, { error: "Start and end must be valid dates." });
    return;
  }
  if (endTime < startTime) {
    sendJson(res, 400, { error: "Event end can't be before its start." });
    return;
  }

  const event = addEvent({ title, description, start, end, location, allDay });
  sendJson(res, 201, { event });
}

async function handleFeedUrl(req, res) {
  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "http";
  sendJson(res, 200, {
    url: `${protocol}://${host}/api/calendar/${getFeedToken()}`,
  });
}

async function handleCalendarFeed(req, res, token) {
  if (token !== getFeedToken()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ics = buildIcs(listEvents(), "My Personal Calendar");
  res.writeHead(200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="calendar.ics"',
  });
  res.end(ics);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (pathname === "/api/events" && req.method === "GET") {
      return await handleGetEvents(req, res);
    }
    if (pathname === "/api/events" && req.method === "POST") {
      return await handlePostEvents(req, res);
    }
    if (pathname === "/api/feed-url" && req.method === "GET") {
      return await handleFeedUrl(req, res);
    }
    const calendarMatch = pathname.match(/^\/api\/calendar\/([a-f0-9]+)$/);
    if (calendarMatch && req.method === "GET") {
      return await handleCalendarFeed(req, res, calendarMatch[1]);
    }
    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found" });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Personal calendar running at http://localhost:${PORT}`);
});
