/**
 * GoogleCalendarService.js
 * CanWe — Google Calendar 整合服務層
 *
 * 職責：
 *   1. OAuth 連線
 *   2. 讀取 Google Calendar 事件
 *   3. 轉換為 CanWe Event 格式
 *   4. 回傳 events[]（dedup 後）
 *
 * 主程式（Home、DayView、WeekView、EventModal）不得直接引用此檔案。
 * 唯一對外介面：GoogleCalendarService.connect(existingEvents, rules)
 *
 * 換成真實 Google OAuth 時，只需替換：
 *   _oauthConnect()
 *   _fetchRawEvents()
 */

// ─── Internal helpers ──────────────────────────────────────────────

function _dateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function _todayAt(h) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

/**
 * Keyword-based status guess.
 * @param {string} title
 * @param {Array<{keyword:string, status:string}>} rules
 * @returns {string} status key
 */
function _guessStatus(title, rules = []) {
  for (const rule of rules) {
    if (title.includes(rule.keyword)) return rule.status;
  }
  // Built-in defaults
  if (/會議|開會|meeting/i.test(title))  return "busy";
  if (/午休|休息|break/i.test(title))    return "free";
  if (/訪視|家訪|個案/i.test(title))     return "busy";
  return "busy";
}

// ─── OAuth ────────────────────────────────────────────────────────
/**
 * Initiate Google OAuth flow.
 * TODO: replace with real implementation:
 *   await gapi.client.init({ apiKey, clientId, discoveryDocs, scope })
 *   await new Promise(res =>
 *     google.accounts.oauth2.initTokenClient({ callback: res }).requestAccessToken()
 *   )
 * @returns {Promise<void>}
 */
async function _oauthConnect() {
  // Mock: simulate 800ms auth delay
  return new Promise(resolve => setTimeout(resolve, 800));
}

// ─── Fetch ────────────────────────────────────────────────────────
/**
 * Fetch raw events from Google Calendar API.
 * TODO: replace with real implementation:
 *   const res = await gapi.client.calendar.events.list({
 *     calendarId: 'primary',
 *     timeMin: new Date().toISOString(),
 *     maxResults: 50,
 *     singleEvents: true,
 *     orderBy: 'startTime',
 *   })
 *   return res.result.items.map(item => ({
 *     gcalId:    item.id,
 *     title:     item.summary ?? '',
 *     startTime: item.start.dateTime ?? item.start.date,
 *     endTime:   item.end.dateTime   ?? item.end.date,
 *   }))
 *
 * @returns {Promise<Array<{gcalId:string, title:string, startTime:string, endTime:string}>>}
 */
async function _fetchRawEvents() {
  return new Promise(resolve => setTimeout(() => resolve([
    { gcalId: "gc1", title: "社區訪視",   startTime: _todayAt(9),  endTime: _todayAt(12) },
    { gcalId: "gc2", title: "個案會議",   startTime: _todayAt(13), endTime: _todayAt(15) },
    { gcalId: "gc3", title: "寫個案紀錄", startTime: _todayAt(15), endTime: _todayAt(17) },
    { gcalId: "gc4", title: "自由時間",   startTime: _todayAt(19), endTime: _todayAt(21) },
  ]), 600));
}

// ─── Convert ──────────────────────────────────────────────────────
let _idCounter = 1000;

/**
 * Convert a raw GCal event to CanWe Event format.
 * @param {object} raw
 * @param {Array} rules
 * @returns {object} CanWe Event
 */
function _convertEvent(raw, rules) {
  return {
    id:        "gcal_" + (++_idCounter),
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

// ─── Dedup ────────────────────────────────────────────────────────
/**
 * Filter out events already imported (matched by gcalId).
 * @param {object[]} proposed
 * @param {object[]} existingEvents
 * @returns {object[]}
 */
function _dedup(proposed, existingEvents) {
  const importedIds = new Set(
    existingEvents.filter(e => e.source === "google").map(e => e.gcalId)
  );
  return proposed.filter(ev => !importedIds.has(ev.gcalId));
}

// ─── Public API ───────────────────────────────────────────────────

export const GoogleCalendarService = {
  /**
   * Full connect flow: OAuth → fetch → convert → dedup.
   * Returns events ready for preview (not yet saved to CanWe).
   *
   * @param {object[]} existingEvents  Current CanWe events (for dedup)
   * @param {object[]} rules           Keyword→status rules from Settings
   * @returns {Promise<object[]>}      Proposed new events with guessed status
   */
  async connect(existingEvents = [], rules = []) {
    await _oauthConnect();
    const raw      = await _fetchRawEvents();
    const proposed = raw.map(ev => _convertEvent(ev, rules));
    return _dedup(proposed, existingEvents);
  },

  /**
   * Adjust status of one proposed event (called from preview UI).
   * Pure function — returns new array without mutating.
   *
   * @param {object[]} proposed
   * @param {string}   gcalId
   * @param {string}   status
   * @returns {object[]}
   */
  adjustStatus(proposed, gcalId, status) {
    return proposed.map(ev => ev.gcalId === gcalId ? { ...ev, status } : ev);
  },

  /**
   * Disconnect / revoke token.
   * TODO: gapi.auth2.getAuthInstance().signOut()
   */
  disconnect() {
    // Mock: nothing to do
  },
};
