"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "store.json");

function load() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(storePath)) {
    const fresh = {
      feedToken: crypto.randomBytes(32).toString("hex"),
      events: [],
    };
    fs.writeFileSync(storePath, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  const raw = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw);

  // Defensive defaults in case of a hand-edited or older file.
  if (typeof parsed.feedToken !== "string") {
    parsed.feedToken = crypto.randomBytes(32).toString("hex");
  }
  if (!Array.isArray(parsed.events)) {
    parsed.events = [];
  }

  return parsed;
}

let store = load();

function save() {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function getFeedToken() {
  return store.feedToken;
}

function listEvents() {
  return [...store.events].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

function addEvent({ title, description, start, end, location, allDay }) {
  const event = {
    id: crypto.randomUUID(),
    title,
    description: description || "",
    start,
    end,
    location: location || "",
    allDay: Boolean(allDay),
    created_at: new Date().toISOString(),
  };

  store.events.push(event);
  save();

  return event;
}

module.exports = { getFeedToken, listEvents, addEvent };
