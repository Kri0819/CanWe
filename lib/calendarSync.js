/**
 * calendarSync.js — CanWe Calendar Sync Module
 *
 * All Google Calendar integration logic lives here.
 * App.jsx calls only: syncCalendar(rules, existingEvents)
 *
 * To connect real Google OAuth, replace _oauthConnect() and _fetchRawEvents().
 * Everything else (event conversion, deduplication, status guessing) stays the same.
 */

// ─── Types (JSDoc) ────────────────────────────────────────────────
/**
 * @typedef {{ id:string, gcalId:string, title:string, date:string, startTime:string, endTime:string, note:string, status:string, source:'google' }} CanWeEvent
 * @typedef {{ keyword:string, status:string }} StatusRule
 */

// ─── Internal helpers ─────────────────────────────────────────────

function _dateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function _todayAt(h) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

/** Fuzzy keyword match against rules, returns matched status or "busy" */
function _guessStatus(title, rules) {
  for (const rule of rules) {
    if (title.includes(rule.keyword)) return rule.status;
  }
  return "busy";
}

// ─── OAuth + Fetch (mock — replace for production) ────────────────

/**
 * Simulates OAuth connection.
 * Replace body with: await gapi.client.init({...}); google.accounts.oauth2...
 * @returns {Promise<void>}
 */
async function _oauthConnect() {
  // TODO: real OAuth
  // await gapi.client.init({ apiKey, clientId, discoveryDocs, scope })
  // await new Promise(res => google.accounts.oauth2.initTokenClient({ callback: res }).requestAccessToken())
  return new Promise(resolve => setTimeout(resolve, 800));
}

/**
 * Fetches raw events from Google Calendar.
 * Replace body with: gapi.client.calendar.events.list({ calendarId:'primary', ... })
 * @returns {Promise<Array<{ gcalId:string, title:string, startTime:string, endTime:string }>>}
 */
async function _fetchRawEvents() {
  // TODO: replace with real API call
  // const res = await gapi.client.calendar.events.list({ calendarId:'primary', timeMin:..., maxResults:50 })
  // return res.result.items.map(item => ({
  //   gcalId:    item.id,
  //   title:     item.summary ?? '',
  //   startTime: item.start.dateTime ?? item.start.date,
  //   endTime:   item.end.dateTime   ?? item.end.date,
  // }))
  return new Promise(resolve => setTimeout(() => resolve([
    { gcalId:"gc1", title:"社區訪視",   startTime:_todayAt(9),  endTime:_todayAt(12) },
    { gcalId:"gc2", title:"個案會議",   startTime:_todayAt(13), endTime:_todayAt(15) },
    { gcalId:"gc3", title:"寫個案紀錄", startTime:_todayAt(15), endTime:_todayAt(17) },
    { gcalId:"gc4", title:"自由時間",   startTime:_todayAt(19), endTime:_todayAt(21) },
  ]), 600));
}

// ─── Event conversion ─────────────────────────────────────────────

/**
 * Convert a raw GCal event to a CanWe event.
 * Applies keyword rules to guess status.
 * @param {{ gcalId:string, title:string, startTime:string, endTime:string }} raw
 * @param {StatusRule[]} rules
 * @param {string} idGenerator — new unique id string
 * @returns {CanWeEvent}
 */
function _convertEvent(raw, rules, id) {
  return {
    id,
    gcalId:    raw.gcalId,
    title:     raw.title,
    date:      _dateStr(new Date(raw.startTime)),
    startTime: raw.startTime,
    endTime:   raw.endTime,
    note:      "",
    status:    _guessStatus(raw.title, rules),
    source:    "google",
  };
}

/**
 * Deduplicate: filter out events already imported (matched by gcalId).
 * @param {CanWeEvent[]} proposed
 * @param {CanWeEvent[]} existing
 * @returns {CanWeEvent[]}
 */
function _dedup(proposed, existing) {
  const importedIds = new Set(existing.filter(e => e.source === "google").map(e => e.gcalId));
  return proposed.filter(ev => !importedIds.has(ev.gcalId));
}

// ─── Public API ───────────────────────────────────────────────────

let _idCounter = 100;
function _newId() { return "gcal_" + (++_idCounter); }

/**
 * Full sync flow: OAuth → fetch → convert → deduplicate.
 * Returns events ready for user preview (with guessed status).
 * App.jsx calls this; it never touches gapi or raw event shapes.
 *
 * @param {StatusRule[]} rules — keyword→status rules from settings
 * @param {CanWeEvent[]} existingEvents — current events in CanWe (for dedup)
 * @returns {Promise<CanWeEvent[]>} proposed new events (not yet saved)
 */
export async function syncCalendar(rules, existingEvents) {
  await _oauthConnect();
  const raw      = await _fetchRawEvents();
  const proposed = raw.map(ev => _convertEvent(ev, rules, _newId()));
  return _dedup(proposed, existingEvents);
}

/**
 * Adjust the status of a single proposed event (called from preview UI).
 * Pure function — returns new array.
 * @param {CanWeEvent[]} proposed
 * @param {string} gcalId
 * @param {string} status
 * @returns {CanWeEvent[]}
 */
export function adjustEventStatus(proposed, gcalId, status) {
  return proposed.map(ev => ev.gcalId === gcalId ? { ...ev, status } : ev);
}
