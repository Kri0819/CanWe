import { useState, useEffect, useRef } from "react";

// ─── v0.9.12 ───────────────────────────────────────────────────────
// 週視圖展開：移至列內、無框、字體放大、時間縮排、箭頭改▾/▴
// Settings: remove emoji icons, restore clean border rows
//   components/TimelineBar.jsx  — pure timeline bar display
//   components/WeekView.jsx     — week grid display + day-click
//   components/DayView.jsx      — day timeline with drag/resize
//   components/ShareSheet.jsx   — share bottom sheet UI
//   services/calendarSync.js    — Google Calendar sync (unchanged)
// App.jsx retains: state, navigation, data loading, settings, modals
// UI / functionality / data flow: zero changes
// Events: add date field (YYYY-MM-DD), save on create/edit
// WeekView + ShareSheet: read real events grouped by date (no more mock week data)

// ─── Status definitions ────────────────────────────────────────────
// ─── Status config ─────────────────────────────────────────────────
// In multi-file project: import { STATUS, STATUS_KEYS, PRIORITY, STATUS_HINTS, guessStatus } from './statusConfig.js'
// Inline below for single-file build compatibility.
const STATUS = {
  busy:    { color: "#C98D86", label: "忙碌",      bg: "#C98D8614", barColor: "#C98D86", emoji: "🔴" },
  urgent:  { color: "#D6B183", label: "急事可聯繫", bg: "#D6B18314", barColor: "#D6B183", emoji: "🟠" },
  reply:   { color: "#C8BE97", label: "可回訊息",  bg: "#C8BE9714", barColor: "#C8BE97", emoji: "🟡" },
  free:    { color: "#8FA89D", label: "空閒",      bg: "#8FA89D14", barColor: "#8FA89D", emoji: "🟢" },
  offline: { color: "#B5AEA7", label: "休息中",    bg: "#B5AEA714", barColor: "#B5AEA7", emoji: "🌙" },
};
const STATUS_KEYS = ["busy", "urgent", "reply", "free", "offline"];
const PRIORITY    = { busy: 5, urgent: 4, reply: 3, free: 2, offline: 1 };
const STATUS_HINTS = { busy: "", urgent: "", reply: "", free: "", offline: "" };

// ─── Keyword rules (import-time recommendations only) ──────────────
const DEFAULT_RULES = [
  { id: 1, keyword: "訪視",       status: "busy"   },
  { id: 2, keyword: "開會",       status: "busy"   },
  { id: 3, keyword: "會議",       status: "busy"   },
  { id: 4, keyword: "Meeting",    status: "busy"   },
  { id: 5, keyword: "看診",       status: "busy"   },
  { id: 6, keyword: "寫個案紀錄", status: "reply"  },
  { id: 7, keyword: "自由時間",   status: "free"   },
  { id: 8, keyword: "Free",       status: "free"   },
];

// guessStatus — extracted to statusConfig.js
// In multi-file: imported from statusConfig.js
function guessStatus(title) {
  for (const rule of DEFAULT_RULES) {
    if (title.includes(rule.keyword)) return rule.status;
  }
  return "busy"; // conservative default
}

// ─── Seed events ───────────────────────────────────────────────────
const TODAY = new Date();
function todayAt(h, m = 0) {
  const d = new Date(TODAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Returns YYYY-MM-DD for any date object
function dateStr(d = new Date()) { return d.toISOString().slice(0, 10); }

let _nextId = 10;
function newId() { return String(++_nextId); }

const SEED_EVENTS = [
  { id: "1", date: dateStr(), title: "個案紀錄", startTime: todayAt(9),  endTime: todayAt(12), note: "", status: "reply" },
  { id: "2", date: dateStr(), title: "午休",     startTime: todayAt(12), endTime: todayAt(13), note: "", status: "free"  },
  { id: "3", date: dateStr(), title: "社區訪視", startTime: todayAt(13), endTime: todayAt(17), note: "", status: "busy"  },
  { id: "4", date: dateStr(), title: "個人時間", startTime: todayAt(18), endTime: todayAt(22), note: "", status: "free"  },
];

// ─── Status engine ─────────────────────────────────────────────────
// Events have explicit status — no keyword inference at render time
function buildBlocks(events) {
  const hourSlots = Array.from({ length: 24 }, (_, h) => {
    let status = "offline";
    for (const ev of events) {
      const s = new Date(ev.startTime).getHours();
      const e = new Date(ev.endTime).getHours();
      if (h >= s && h < e) {
        if (PRIORITY[ev.status] > PRIORITY[status]) status = ev.status;
      }
    }
    return { hour: h, status };
  });
  const merged = [];
  for (const slot of hourSlots) {
    const last = merged[merged.length - 1];
    if (last && last.status === slot.status) { last.end = slot.hour + 1; }
    else merged.push({ start: slot.hour, end: slot.hour + 1, status: slot.status });
  }
  return merged;
}

function buildHourMap(blocks) {
  const m = {};
  for (const b of blocks) for (let h = b.start; h < b.end; h++) m[h] = b.status;
  return m;
}

function fmt(h) { return `${String(h).padStart(2,"0")}:00`; }
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDateLabel(d = new Date()) {
  return d.toLocaleDateString("zh-TW", { weekday:"long", month:"long", day:"numeric" });
}

const SHARE_URL = "https://canwe.app/u/demo";

// ─── Week date helpers ─────────────────────────────────────────────
function getWeekBounds() {
  const today = new Date();
  const dow   = today.getDay(); // 0=Sun
  const mon   = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7));
  const sun   = new Date(mon);  sun.setDate(mon.getDate() + 6);
  const year  = today.getFullYear();
  // ISO week number
  const tmp = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum   = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  const fmtMD = (d) => d.toLocaleDateString("zh-TW", { month:"numeric", day:"numeric" });
  const range = `${fmtMD(mon)} – ${fmtMD(sun)}`;
  return { year, weekNum, range, mon, sun };
}
function getWeekHeader() {
  const { year, weekNum, range } = getWeekBounds();
  return `${year} 年 第 ${weekNum} 週｜${range}`;
}

const WEEK_DAYS_BASE = ["一","二","三","四","五","六","日"];
// Returns 7-element array starting from weekStart (0=Mon..6=Sun)
function getWeekDays(weekStart = 0) {
  return Array.from({length:7}, (_,i) => WEEK_DAYS_BASE[(weekStart + i) % 7]);
}
// Keep WEEK_DAYS for backwards compat (default Mon-start)
const WEEK_DAYS = WEEK_DAYS_BASE;
// Build array of 7 event-arrays for the current week from real events.
// weekStart: 0=Mon, 1=Tue, ..., 6=Sun (matches WEEK_DAYS index)
function buildWeekEvents(events, weekStart = 0) {
  const today = new Date();
  // dow: 0=Mon..6=Sun
  const dow = (today.getDay() + 6) % 7;
  // How many days back to reach the weekStart day
  let offset = dow - weekStart;
  if (offset < 0) offset += 7;
  const startOffset = -offset;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + startOffset + i);
    const ds = dateStr(d);
    return events.filter(ev => ev.date === ds);
  });
}

// ─── CSS ───────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Noto+Serif+TC:wght@400;500;600&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #F6F3EE;
  --surface:  #FFFFFF;
  --surface2: #F0ECE6;
  --border:   rgba(58,52,46,0.09);
  --border2:  rgba(58,52,46,0.16);
  --text:     #3A342E;
  --muted:    #8A8078;
  --muted2:   #B0A89E;
  --accent:   #7C6F62;
  --radius:   12px;
  --font-d:   'DM Serif Display', Georgia, serif;
  --font-b:   'Noto Serif TC', 'Hiragino Mincho ProN', Georgia, serif;
  --c-busy:    #C98D86;
  --c-urgent:  #D6B183;
  --c-reply:   #C8BE97;
  --c-free:    #8FA89D;
  --c-offline: #B5AEA7;
}
html, body {
  background: var(--bg); color: var(--text); font-family: var(--font-b);
  font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased;
}

/* ── Loading ── */
.ls {
  position: fixed; inset: 0; background: var(--bg); z-index: 200;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  transition: opacity 0.55s ease, visibility 0.55s ease;
}
.ls.hidden { opacity: 0; visibility: hidden; }
.ls-title {
  font-family: var(--font-d); font-style: italic;
  font-size: clamp(3rem, 11vw, 6rem); letter-spacing: -1.5px; line-height: 1;
  animation: su 0.8s cubic-bezier(0.16,1,0.3,1) both;
}
.ls-sub {
  font-size: 0.8rem; font-weight: 400; letter-spacing: 0.18em; color: var(--muted);
  animation: su 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s both;
}
.ls-pip {
  width: 4px; height: 4px; border-radius: 50%; background: var(--c-free);
  animation: su 0.8s cubic-bezier(0.16,1,0.3,1) 0.28s both, blink 1.4s ease-in-out 0.7s infinite;
}
@keyframes su    { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
@keyframes blink { 0%,100% { opacity:.2 } 50% { opacity:.8 } }

/* ── Shell ── */
.app {
  max-width: 460px; margin: 0 auto; min-height: 100dvh;
  display: flex; flex-direction: column; padding-bottom: 64px;
}

/* ── Bottom Nav ── */
.bnav {
  position: fixed; bottom: 0; left: 0; right: 0;
  width: 100%;
  display: flex; background: rgba(246,243,238,0.96);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  z-index: 100;
}
.bnav-tab {
  flex: 1; border: none; background: none; cursor: pointer;
  padding: 14px 4px 18px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-family: var(--font-b); font-size: 0.7rem; font-weight: 400;
  color: var(--muted2); transition: color 0.16s;
}
.bnav-tab.on { color: var(--text); }
.bnav-tab svg { width: 24px; height: 24px; stroke-width: 1.5; }

/* ── Page header ── */
.page-header {
  padding: 20px 22px 0;
  font-family: var(--font-d); font-style: italic; font-size: 1.5rem;
  letter-spacing: -0.5px; color: var(--text);
}
.page-date { font-family: var(--font-b); font-size: 0.72rem; font-weight: 400; color: var(--muted); margin-top: 2px; }

/* ── Page ── */
.page { flex: 1; padding: 20px 22px 32px; display: flex; flex-direction: column; gap: 18px; }

/* ── Cards ── */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px 22px;
  animation: fi 0.38s ease both;
}
.card + .card, .card ~ * { animation-delay: 0.06s; }
@keyframes fi { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
.card-label {
  font-family: var(--font-b); font-size: 0.66rem; font-weight: 400;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted2); margin-bottom: 14px;
}

/* ── Status pip ── */
.pip {
  border-radius: 50%; flex-shrink: 0; display: inline-block;
}
.pip-sm  { width: 8px;  height: 8px;  }
.pip-md  { width: 11px; height: 11px; }
.pip-lg  { width: 14px; height: 14px; }
.pip.free    { background: var(--c-free);    box-shadow: 0 0 8px #8FA89D48; animation: breathe 2.6s ease-in-out infinite; }
.pip.busy    { background: var(--c-busy);    box-shadow: 0 0 5px #C98D8630; }
.pip.urgent  { background: var(--c-urgent);  box-shadow: 0 0 5px #D6B18330; }
.pip.reply   { background: var(--c-reply);   box-shadow: 0 0 5px #C8BE9730; }
.pip.offline { background: var(--c-offline); }
@keyframes breathe { 0%,100%{box-shadow:0 0 4px #8FA89D28}50%{box-shadow:0 0 13px #8FA89D58} }

/* ── Timeline bar ── */
.tl-wrap { position: relative; }
.tl-track {
  position: relative; height: 16px; border-radius: 5px; overflow: hidden;
  background: var(--surface2);
}
.tl-seg { position: absolute; top: 0; bottom: 0; transition: filter 0.18s; }
.tl-seg:hover { filter: brightness(0.9); }
.tl-labels { display: flex; justify-content: space-between; margin-top: 6px; }
.tl-lbl { font-family: var(--font-b); font-size: 0.58rem; color: var(--muted2); }

/* ── Buttons ── */
.btn-row { display: flex; gap: 10px; }
.btn {
  flex: 1; padding: 12px 10px; border: none; border-radius: 10px; cursor: pointer;
  font-family: var(--font-b); font-size: 0.85rem; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  transition: transform 0.13s, filter 0.13s;
  letter-spacing: 0.02em;
}
.btn:active { transform: scale(0.97); }
.btn-p { background: var(--text); color: var(--bg); }
.btn-p:hover { filter: brightness(1.1); }
.btn-g { background: var(--surface2); color: var(--text); border: 1px solid var(--border2); }
.btn-g:hover { border-color: rgba(58,52,46,0.28); }
.btn-outline { flex: none; padding: 8px 14px; background: none; border: 1px solid var(--border2); color: var(--text); border-radius: 9px; font-size: 0.8rem; font-family: var(--font-b); cursor: pointer; transition: border-color 0.15s; }
.btn-outline:hover { border-color: var(--accent); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Events page ── */
.ev-section-label {
  font-family: var(--font-b); font-size: 0.66rem; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--muted2); padding: 0 2px; margin-bottom: 8px;
}
.ev-list { display: flex; flex-direction: column; gap: 8px; }
.ev-item {
  display: flex; align-items: stretch; gap: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  cursor: pointer; transition: border-color 0.15s;
}
.ev-item:hover { border-color: var(--border2); }
.ev-stripe { width: 4px; flex-shrink: 0; }
.ev-body { flex: 1; padding: 13px 16px; display: flex; align-items: center; gap: 12px; }
.ev-time { font-size: 0.73rem; color: var(--muted); min-width: 86px; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.ev-title { flex: 1; font-size: 0.9rem; font-weight: 500; }
.ev-status-badge {
  font-size: 0.68rem; font-weight: 400; padding: 3px 8px;
  border-radius: 99px; border: 1px solid; white-space: nowrap;
}
.ev-actions { display: flex; align-items: center; gap: 4px; padding-right: 10px; }
.ev-action-btn {
  background: none; border: none; cursor: pointer; padding: 6px;
  color: var(--muted2); border-radius: 6px; font-size: 0.8rem;
  transition: color 0.15s, background 0.15s;
}
.ev-action-btn:hover { color: var(--text); background: var(--surface2); }
.ev-empty {
  text-align: center; padding: 40px 20px;
  font-size: 0.85rem; color: var(--muted2); line-height: 2;
}

/* ── Add/Edit event modal ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(58,52,46,0.28);
  backdrop-filter: blur(4px); z-index: 150;
  display: flex; align-items: flex-end; justify-content: center;
  animation: bdin 0.22s ease both;
}
@keyframes bdin { from { opacity:0 } to { opacity:1 } }
.modal {
  background: var(--surface); border-radius: 18px 18px 0 0;
  width: 100%; max-width: 100%; padding: 24px 22px 40px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 18px;
  animation: slideup 0.28s cubic-bezier(0.16,1,0.3,1) both;
  max-height: 92dvh; overflow-y: auto;
}
@keyframes slideup { from { transform: translateY(100%) } to { transform: none } }
.modal-title { font-family: var(--font-d); font-style: italic; font-size: 1.2rem; }
.modal-drag { width: 36px; height: 4px; border-radius: 2px; background: var(--border2); margin: 0 auto -6px; }

/* ── Form elements ── */
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 0.72rem; letter-spacing: 0.12em; color: var(--muted); }
.input {
  background: var(--surface2); border: 1px solid var(--border2); border-radius: 9px;
  color: var(--text); font-family: var(--font-b); font-size: 0.9rem; font-weight: 400;
  padding: 11px 14px; outline: none; width: 100%;
  transition: border-color 0.15s;
}
.input:focus { border-color: var(--accent); }
.time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; min-width: 0; }
.time-row > * { min-width: 0; overflow: hidden; }
input[type="time"].input { width: 100%; min-width: 0; appearance: none; -webkit-appearance: none; }

/* ── Status picker in modal ── */
.status-picker { display: flex; flex-direction: column; gap: 7px; }
.status-option {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border);
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
  background: var(--surface2);
}
.status-option:hover { border-color: var(--border2); }
.status-option.selected { border-width: 1.5px; }
.status-option-label { font-size: 0.88rem; font-weight: 500; flex: 1; }
.status-option-hint { font-size: 0.72rem; color: var(--muted); }

/* ── Share page ── */
.sh-head { text-align: center; }
.sh-title { font-family: var(--font-b); font-weight: 500; font-size: 1.15rem; letter-spacing: 0.02em; line-height: 1.5; }
.sh-date  { font-size: 0.74rem; color: var(--muted); margin-top: 4px; letter-spacing: 0.06em; }
.sh-tabs  { display: flex; background: var(--surface2); border-radius: 9px; padding: 3px; gap: 3px; }
.sh-tab   {
  flex: 1; padding: 8px; border: none; border-radius: 7px; cursor: pointer;
  font-family: var(--font-b); font-size: 0.8rem; font-weight: 400;
  background: none; color: var(--muted); transition: all 0.16s;
}
.sh-tab.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(58,52,46,0.08); }

/* ── View toggle: rectangular segmented control ── */
.view-toggle {
  display: flex; background: var(--surface2); border-radius: 10px;
  padding: 3px; gap: 3px; width: fit-content; align-self: center;
}
.view-toggle-btn {
  padding: 6px 18px; border: none; background: none; cursor: pointer;
  font-family: var(--font-b); font-size: 0.82rem; font-weight: 400;
  color: var(--muted); border-radius: 8px; transition: all 0.16s; white-space: nowrap;
}
.view-toggle-btn.on {
  background: var(--surface); color: var(--text); font-weight: 500;
  box-shadow: 0 1px 4px rgba(58,52,46,0.10);
}

/* ── Date nav row ── */
.date-nav-row {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 6px 0;
}
.date-nav-btn {
  background: none; border: none; cursor: pointer;
  font-size: 1rem; color: var(--muted); padding: 4px 8px;
  transition: color 0.15s;
}
.date-nav-btn:hover { color: var(--text); }
.date-nav-label {
  font-family: var(--font-b); font-size: 0.95rem; font-weight: 500;
  color: var(--text); min-width: 130px; text-align: center;
}

/* ── Month view ── */
.mv-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
}
.mv-day-hdr {
  text-align: center; font-size: 0.65rem; color: var(--muted2); padding: 4px 0;
  font-family: var(--font-b);
}
.mv-cell {
  aspect-ratio: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start;
  padding: 4px 2px; border-radius: 8px; cursor: pointer;
  transition: background 0.14s; position: relative;
}
.mv-cell:hover { background: var(--surface2); }
.mv-cell.today { background: var(--surface2); }
.mv-cell.today .mv-date { background: var(--text); color: var(--bg); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.mv-cell.other-month .mv-date { color: var(--muted2); }
.mv-date { font-size: 0.78rem; font-family: var(--font-b); color: var(--text); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.mv-dots { display: flex; gap: 2px; margin-top: 2px; flex-wrap: wrap; justify-content: center; }
.mv-dot { width: 5px; height: 5px; border-radius: 50%; }
.mv-selected { outline: 2px solid var(--accent); outline-offset: 1px; }
.sh-blocks { display: flex; flex-direction: column; gap: 6px; }
.sh-block {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border);
}
.sh-block-time { font-size: 0.75rem; color: var(--muted); width: 112px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sh-block-lbl  { font-size: 0.88rem; font-weight: 500; }
.legend { display: flex; flex-wrap: wrap; gap: 10px 20px; }
.legend-item { display: flex; align-items: center; gap: 7px; font-size: 0.76rem; color: var(--muted); }
.privacy-note {
  font-size: 0.71rem; color: var(--muted2); text-align: center;
  border: 1px solid var(--border); border-radius: 9px;
  padding: 11px 16px; line-height: 1.8;
}


/* ── Settings ── */
.sec-head { font-size: 0.68rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted2); margin-bottom: 10px; font-weight: 400; }
.gcal-connected { display: flex; align-items: center; gap: 12px; background: #8FA89D12; border: 1px solid #8FA89D32; border-radius: 10px; padding: 13px 16px; }
.gcal-connect-btn {
  width: 100%; padding: 13px; border-radius: 10px; border: 1px dashed rgba(58,52,46,0.2); background: none;
  color: var(--text); font-family: var(--font-b); font-size: 0.85rem; font-weight: 400; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 9px; transition: border-color 0.18s, color 0.18s;
}
.gcal-connect-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.gcal-connect-btn:disabled { opacity: 0.55; cursor: wait; }
.rule-row { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.rule-row:last-child { border-bottom: none; }
.rule-kw  { flex: 1; font-size: 0.85rem; }
.rule-arr { color: var(--muted2); font-size: 0.8rem; }
.sel {
  background: var(--surface2); border: 1px solid var(--border2); border-radius: 7px;
  color: var(--text); font-family: var(--font-b); font-size: 0.78rem;
  padding: 5px 8px; cursor: pointer; outline: none; appearance: auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(58,52,46,0.15); border-top-color: var(--text); animation: spin 0.7s linear infinite; flex-shrink: 0; }

/* ── Toast ── */
.toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(60px);
  background: var(--text); color: var(--bg); border-radius: 8px;
  padding: 9px 22px; font-family: var(--font-b); font-size: 0.8rem; white-space: nowrap;
  transition: transform 0.28s cubic-bezier(0.16,1,0.3,1); z-index: 50; pointer-events: none;
  /* keep toast centered within viewport — acceptable for toast notifications */
}
.toast.show { transform: translateX(-50%) translateY(0); }
/* ── Settings menu ── */
.settings-menu { display: flex; flex-direction: column; gap: 8px; }
.settings-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius);
  cursor: pointer; transition: border-color 0.15s;
}
.settings-row:hover { border-color: var(--border2); }
.settings-row-body { flex: 1; }
.settings-row-title { font-size: 0.9rem; font-weight: 500; }
.settings-row-desc  { font-size: 0.73rem; color: var(--muted); margin-top: 2px; }
.settings-row-arrow { color: var(--muted2); font-size: 0.85rem; }
.settings-back {
  display: flex; align-items: center; gap: 8px;
  background: none; border: none; cursor: pointer;
  font-family: var(--font-b); font-size: 0.82rem; color: var(--muted);
  padding: 0; margin-bottom: 18px; transition: color 0.15s;
}
.settings-back:hover { color: var(--text); }

/* ── Status editor ── */
.status-editor-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.status-editor-row:last-child { border-bottom: none; }
.status-color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 8px; }
.status-name-input { flex: 1; background: none; border: none; outline: none; font-family: var(--font-b); font-size: 0.9rem; font-weight: 500; color: var(--text); padding: 4px 0; border-bottom: 1px solid transparent; transition: border-color 0.15s; }
.status-name-input:focus { border-bottom-color: var(--accent); }
.status-desc-input { width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 7px; font-family: var(--font-b); font-size: 0.78rem; color: var(--muted); padding: 6px 10px; outline: none; margin-top: 4px; transition: border-color 0.15s; }
.status-desc-input:focus { border-color: var(--accent); }

/* ── Time range picker ── */
.time-range-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.time-range-label { font-size: 0.82rem; font-weight: 500; min-width: 52px; }
.time-range-select { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; color: var(--text); font-family: var(--font-b); font-size: 0.85rem; padding: 8px 12px; cursor: pointer; outline: none; flex: 1; }

/* ── Recurring schedule ── */
.recur-row {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 0; border-bottom: 1px solid var(--border);
}
.recur-row:last-child { border-bottom: none; }
.recur-days { display: flex; gap: 5px; flex-wrap: wrap; }
.recur-day-btn {
  width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border2);
  background: var(--surface2); font-family: var(--font-b); font-size: 0.72rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.14s; color: var(--muted); font-weight: 400;
}
.recur-day-btn.on { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 500; }
.recur-time-row { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; }
.recur-time-sep { color: var(--muted2); }
.recur-time-sel {
  background: var(--surface2); border: 1px solid var(--border2); border-radius: 7px;
  color: var(--text); font-family: var(--font-b); font-size: 0.8rem;
  padding: 5px 8px; cursor: pointer; outline: none;
}
.recur-empty {
  text-align: center; padding: 32px 16px;
  font-size: 0.84rem; color: var(--muted2); line-height: 2;
}
.recur-tag {
  display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;
}
.recur-tag-chip {
  font-size: 0.68rem; padding: 2px 8px; border-radius: 99px;
  background: var(--surface2); color: var(--muted); border: 1px solid var(--border);
}


/* ── Share bottom sheet ── */
.sh-sheet-backdrop { position: fixed; inset: 0; background: rgba(58,52,46,0.22); backdrop-filter: blur(3px); z-index: 150; animation: bdin 0.2s ease both; }
@keyframes bdin { from { opacity:0 } to { opacity:1 } }
.sh-sheet { position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-radius: 20px 20px 0 0; padding: 20px 22px 44px; display: flex; flex-direction: column; gap: 16px; z-index: 151; animation: slideup 0.28s cubic-bezier(0.16,1,0.3,1) both; max-height: 88dvh; overflow-y: auto; }
@keyframes slideup { from { transform: translateY(100%) } to { transform: none } }
.sh-sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--border2); margin: 0 auto -4px; }
.sh-sheet-title { font-family: var(--font-d); font-style: italic; font-size: 1.15rem; }
.sh-preview { background: var(--surface2); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.sh-preview-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.sh-preview-row:last-child { border-bottom: none; }
.sh-preview-time { font-size: 0.75rem; color: var(--muted); min-width: 100px; font-variant-numeric: tabular-nums; }
.sh-preview-lbl  { font-size: 0.86rem; font-weight: 500; }

/* ── Day view timeline ── */
.dv-container { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 10px 0 8px; }
.dv-wrap { position: relative; display: flex; padding-bottom: 16px; }
.dv-time-col { width: 40px; flex-shrink: 0; position: relative; }
.dv-hour-lbl { position: absolute; right: 8px; font-family: var(--font-b); font-size: 0.6rem; color: var(--muted2); font-variant-numeric: tabular-nums; transform: translateY(-50%); user-select: none; pointer-events: none; }
.dv-col { flex: 1; position: relative; border-left: 1px solid var(--border); }
.dv-gridline { position: absolute; left: 0; right: 0; border-top: 1px solid var(--border); pointer-events: none; }
.dv-gridline.half { border-top-style: dashed; opacity: 0.5; }
.dv-event { position: absolute; left: 6px; right: 6px; border-radius: 8px; border-left: 3px solid; padding: 5px 8px; cursor: pointer; display: flex; flex-direction: column; overflow: hidden; user-select: none; box-shadow: 0 1px 4px rgba(58,52,46,0.08); }
.dv-event-title { font-family: var(--font-b); font-size: 0.78rem; font-weight: 500; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dv-event-time  { font-family: var(--font-b); font-size: 0.62rem; opacity: 0.75; margin-top: 2px; }
.dv-resize { position: absolute; left: 0; right: 0; height: 10px; cursor: ns-resize; z-index: 5; }
.dv-resize.top { top: 0; } .dv-resize.bottom { bottom: 0; }
.dv-now-line { position: absolute; left: 0; right: 0; pointer-events: none; z-index: 6; }
.dv-now-line::before { content: ''; display: block; height: 2px; background: var(--c-busy); opacity: 0.7; }
.dv-now-dot { position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--c-busy); }

/* ── FAB ── */
.fab { position: fixed; bottom: 88px; right: 16px; width: 48px; height: 48px; border-radius: 50%; background: var(--text); color: var(--bg); border: none; cursor: pointer; font-size: 1.4rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 12px rgba(58,52,46,0.22); transition: transform 0.15s, box-shadow 0.15s; z-index: 40; }
.fab:hover { transform: scale(1.07); }
.fab:active { transform: scale(0.95); }

/* ── Onboarding overlay ── */
.ob-overlay {
  position: fixed; inset: 0; background: var(--bg); z-index: 200;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 28px; gap: 24px;
  animation: fi 0.4s ease both;
}
.ob-title  { font-family: var(--font-d); font-style: italic; font-size: 2.2rem; letter-spacing: -1px; text-align: center; }
.ob-sub    { font-size: 0.82rem; color: var(--muted); text-align: center; line-height: 1.7; letter-spacing: 0.04em; }
.ob-card   { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; width: 100%; display: flex; flex-direction: column; gap: 16px; }
.ob-label  { font-size: 0.78rem; font-weight: 500; color: var(--text); }
.ob-select { background: var(--surface2); border: 1px solid var(--border2); border-radius: 9px; color: var(--text); font-family: var(--font-b); font-size: 0.92rem; padding: 10px 14px; outline: none; width: 100%; appearance: auto; cursor: pointer; }
.ob-cross-note { font-size: 0.72rem; color: var(--muted); text-align: center; line-height: 1.6; }
`;

function injectCSS() {
  if (document.getElementById("cw-css")) return;
  const el = document.createElement("style");
  el.id = "cw-css";
  el.textContent = CSS;
  document.head.appendChild(el);
}

// ─── Persistent storage helpers ───────────────────────────────────
const RANGE_KEY = "canwe:displayRange";
const ONBOARD_KEY = "canwe:onboarded";

async function loadRange() {
  try {
    const r = await window.storage.get(RANGE_KEY);
    if (r?.value) return JSON.parse(r.value);
  } catch (_) {}
  return null;
}
async function saveRange(range) {
  try { await window.storage.set(RANGE_KEY, JSON.stringify(range)); } catch (_) {}
}
async function loadOnboarded() {
  try {
    const r = await window.storage.get(ONBOARD_KEY);
    return r?.value === "1";
  } catch (_) { return false; }
}
async function saveOnboarded() {
  try { await window.storage.set(ONBOARD_KEY, "1"); } catch (_) {}
}

// Cross-day aware helpers for DayView
// If start > end (e.g. 22→8), total = (24 - start) + end hours
function rangeHours(start, end) {
  return start <= end ? end - start : (24 - start) + end;
}
// Normalise a clock-hour into offset-minutes from rangeStart
// Returns null if the hour is outside the range
function hourToOffset(h, rangeStart, totalH) {
  const crossDay = rangeStart > (rangeStart + totalH) % 24; // wraps midnight
  let offset = h - rangeStart;
  if (offset < 0) offset += 24;
  if (offset > totalH) return null; // outside visible range
  return offset;
}

// ─── Onboarding component ─────────────────────────────────────────
const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => i);

function Onboarding({ onDone }) {
  const [start, setStart] = useState(8);
  const [end,   setEnd]   = useState(22);

  const isCrossDay = end <= start;
  const hoursCount = isCrossDay ? (24 - start) + end : end - start;
  const valid      = hoursCount >= 1 && hoursCount <= 23;

  const confirm = async () => {
    if (!valid) return;
    const range = { start, end };
    await saveRange(range);
    await saveOnboarded();
    onDone(range);
  };

  return (
    <div className="ob-overlay">
      <div className="ob-title">Can we…?</div>
      <div className="ob-sub">
        請先設定你的日常作息時間<br />
        之後可以在設定裡修改
      </div>

      <div className="ob-card">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div className="ob-label">我的一天從幾點開始？</div>
          <select className="ob-select" value={start} onChange={e => setStart(Number(e.target.value))}>
            {HOUR_OPTS.map(h => (
              <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>
            ))}
          </select>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div className="ob-label">幾點結束？</div>
          <select className="ob-select" value={end} onChange={e => setEnd(Number(e.target.value))}>
            {HOUR_OPTS.map(h => (
              <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>
            ))}
          </select>
        </div>
        <div style={{
          fontSize:"0.78rem", color: isCrossDay ? "var(--c-reply)" : "var(--muted)",
          textAlign:"center", padding:"6px 0",
        }}>
          {isCrossDay
            ? `🌙 跨日模式：${String(start).padStart(2,"0")}:00 → 隔日 ${String(end).padStart(2,"0")}:00（共 ${hoursCount} 小時）`
            : `共 ${hoursCount} 小時`}
        </div>
      </div>

      <div className="ob-cross-note">
        晚上上班的人可以選跨日時間<br />例如 22:00 → 08:00
      </div>

      <button className="btn btn-p" style={{ width:"100%", flex:"none" }}
        onClick={confirm} disabled={!valid}>
        開始使用
      </button>
    </div>
  );
}

function Pip({ status, size = "md" }) {
  return <span className={`pip pip-${size} ${status}`} />;
}

// ─── TimelineBar — extracted to components/TimelineBar.jsx ────────
function TimelineBar({ blocks }) {
  const TOTAL = 24;
  return (
    <div className="tl-wrap">
      <div className="tl-track">
        {blocks.map((b, i) => (
          <div key={i} className="tl-seg"
            style={{ left:`${(b.start/TOTAL)*100}%`, width:`${((b.end-b.start)/TOTAL)*100}%`, background: STATUS[b.status].barColor }}
            title={`${fmt(b.start)}–${fmt(b.end)} · ${STATUS[b.status].label}`}
          />
        ))}
      </div>
      <div className="tl-labels">
        {[0,6,12,18,24].map(h => <span key={h} className="tl-lbl">{String(h).padStart(2,"0")}</span>)}
      </div>
    </div>
  );
}

const GRID_START = 0, GRID_END = 24;
const GRID_HOURS = Array.from({ length: GRID_END - GRID_START }, (_,i) => i);

// ─── Week summary helpers ─────────────────────────────────────────
function getDaySummary(dayEvents, rangeStart, rangeEnd) {
  const blocks = buildBlocks(dayEvents);
  const visible = blocks.filter(b => b.end > rangeStart && b.start < rangeEnd);
  let freeH = 0, busyH = 0, replyH = 0;
  for (const b of visible) {
    const h = Math.min(b.end, rangeEnd) - Math.max(b.start, rangeStart);
    if (b.status === "free")   freeH  += h;
    else if (b.status === "reply") replyH += h;
    else if (b.status === "busy" || b.status === "urgent") busyH += h;
  }
  const label =
    freeH >= 5     ? `空閒 ${freeH}h` :
    busyH >= 8     ? "幾乎全忙" :
    freeH > 0      ? `空閒 ${freeH}h` :
    replyH > 0     ? `可回訊息 ${replyH}h` : "休息中";
  return { freeH, busyH, replyH, score: freeH * 3 + replyH * 2, label, blocks: visible };
}

// Rank days: best → good → ok → busy
function getWeekRecommendations(weekEvents, rangeStart, rangeEnd) {
  const summaries = weekEvents.map((evs, di) => {
    const summary = getDaySummary(evs || [], rangeStart, rangeEnd);
    return Object.assign({ di }, summary);
  });
  const best = summaries.filter(d => d.freeH  >= 4);
  const good = summaries.filter(d => d.freeH  >= 1 && d.freeH < 4);
  const ok   = summaries.filter(d => d.replyH >= 2 && d.freeH === 0);
  const busy = summaries.filter(d => d.busyH  >= 6 && d.freeH === 0 && d.replyH === 0);
  return { best, good, ok, busy };
}

function WeekGrid({ weekEvents, rangeStart = 8, rangeEnd = 22, onDayClick, weekStart = 0, expandedDay = null, getExpandDate }) {
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;
  let todayIdx = todayDow - weekStart;
  if (todayIdx < 0) todayIdx += 7;
  const weekDays = getWeekDays(weekStart);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {weekDays.map((day, di) => {
        const sum     = getDaySummary(weekEvents[di] || [], rangeStart, rangeEnd);
        const isToday = di === todayIdx;
        const span    = rangeEnd - rangeStart;
        const colDate = getExpandDate ? getExpandDate(di) : null;
        const isExpanded = colDate && colDate === expandedDay;

        return (
          <div key={di}>
            <div onClick={() => onDayClick && onDayClick(di)}
              style={{
                display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
                borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                cursor: onDayClick ? "pointer" : "default",
                border:`1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                borderBottom: isExpanded ? "none" : undefined,
                background: isToday ? "rgba(124,111,98,0.06)" : "var(--surface)",
                transition:"border-color 0.15s",
              }}>
              <div style={{ width:28, flexShrink:0,
                fontFamily:"var(--font-b)", fontSize:"0.82rem",
                fontWeight: isToday ? 600 : 400,
                color: isToday ? "var(--accent)" : "var(--text)" }}>
                週{day}
              </div>
              <div style={{ flex:1, height:10, borderRadius:4, overflow:"hidden",
                background:"var(--surface2)", position:"relative" }}>
                {sum.blocks.map((b, i) => {
                  const left  = ((Math.max(b.start, rangeStart) - rangeStart) / span) * 100;
                  const width = ((Math.min(b.end, rangeEnd) - Math.max(b.start, rangeStart)) / span) * 100;
                  return (
                    <div key={i} style={{
                      position:"absolute", top:0, bottom:0,
                      left:`${left}%`, width:`${width}%`,
                      background: STATUS[b.status].barColor,
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize:"0.78rem", color:"var(--muted)", minWidth:60,
                textAlign:"right", fontFamily:"var(--font-b)" }}>
                {sum.label}
              </div>
              {onDayClick && (
                <span style={{ color:"var(--muted2)", fontSize:"0.82rem", minWidth:14, textAlign:"center" }}>
                  {isExpanded ? "▴" : "▾"}
                </span>
              )}
            </div>

            {isExpanded && (
              <div style={{
                border:`1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                borderTop:"none", borderRadius:"0 0 10px 10px",
                background: isToday ? "rgba(124,111,98,0.04)" : "var(--surface)",
                padding:"10px 14px 14px 54px",
              }}>
                {sum.blocks.filter(b => b.status !== "offline").length === 0 ? (
                  <div style={{ fontSize:"0.85rem", color:"var(--muted2)" }}>無行程</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {sum.blocks.filter(b => b.status !== "offline").map((b, i) => {
                      const s = STATUS[b.status];
                      const startH = Math.max(b.start, rangeStart);
                      const endH   = Math.min(b.end, rangeEnd);
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <Pip status={b.status} size="sm" />
                          <span style={{ fontSize:"0.82rem", color:"var(--muted)", fontVariantNumeric:"tabular-nums", minWidth:100 }}>
                            {String(startH).padStart(2,"0")}:00–{String(endH).padStart(2,"0")}:00
                          </span>
                          <span style={{ fontSize:"0.88rem", fontWeight:500, color:s.color }}>{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
// ─── Event modal (add / edit) ──────────────────────────────────────
function EventModal({ event, onSave, onClose }) {
  const isEdit = !!event?.id;
  const nowH = new Date().getHours();
  const [form, setForm] = useState({
    title:     event?.title     ?? "",
    date:      event?.date      ?? dateStr(),
    startTime: event?.startTime ? fmtTime(event.startTime) : `${String(nowH).padStart(2,"0")}:00`,
    endTime:   event?.endTime   ? fmtTime(event.endTime)   : `${String(nowH+1).padStart(2,"0")}:00`,
    note:      event?.note      ?? "",
    status:    event?.status    ?? "busy",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) return;
    const startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString();
    const endTime   = new Date(`${form.date}T${form.endTime}:00`).toISOString();
    onSave({ id: event?.id ?? newId(), date: form.date, title: form.title.trim(), startTime, endTime, note: form.note, status: form.status });
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-drag" />
        <div className="modal-title">{isEdit ? "編輯事件" : "新增事件"}</div>

        <div className="field">
          <div className="field-label">事件名稱</div>
          <input className="input" placeholder="例：社區訪視、個案會議…" value={form.title}
            onChange={e => {
              const v = e.target.value;
              const suggested = guessStatus(v);
              set("title", v);
              if (!isEdit) set("status", suggested);
            }} />
        </div>

        <div className="field">
          <div className="field-label">日期</div>
          <input className="input" type="date" value={form.date}
            onChange={e => set("date", e.target.value)} />
        </div>

        <div className="time-row">
          <div className="field">
            <div className="field-label">開始時間</div>
            <input className="input" type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">結束時間</div>
            <input className="input" type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
          </div>
        </div>

        <div className="field">
          <div className="field-label">這段時間別人可以怎麼找我？</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {STATUS_KEYS.map(k => {
              const s = STATUS[k];
              const selected = form.status === k;
              return (
                <div key={k}
                  style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"9px 12px", borderRadius:9,
                    border:`1px solid ${selected ? s.color : "var(--border)"}`,
                    background: selected ? s.bg : "var(--surface2)",
                    cursor:"pointer", transition:"all 0.14s",
                  }}
                  onClick={() => set("status", k)}>
                  <Pip status={k} size="sm" />
                  <span style={{ fontSize:"0.88rem", fontWeight: selected ? 500 : 400, color: selected ? s.color : "var(--text)" }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="btn-row">
          <button className="btn btn-g" onClick={onClose}>取消</button>
          <button className="btn btn-p" onClick={handleSave} disabled={!form.title.trim()}>
            {isEdit ? "儲存" : "新增"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Share Sheet ───────────────────────────────────────────────────
// Single preview: timeline bar + status blocks (no titles, no notes)
// Two action buttons: 複製連結 + 存成圖片
// ─── ShareSheet — extracted to components/ShareSheet.jsx ──────────
function ShareSheet({ events, onClose, toast, mode = "today" }) {
  const blocks    = buildBlocks(events.filter(ev => !ev.date || ev.date === dateStr()));
  const daytime   = blocks.filter(b => b.end > 8 && b.start < 22 && b.status !== "offline");
  const dateLabel = new Date().toLocaleDateString("zh-TW", { month:"long", day:"numeric" });
  const weekday   = new Date().toLocaleDateString("zh-TW", { weekday:"long" });
  const isWeek    = mode === "week";

  const weekEvents = buildWeekEvents(events);

  const copyLink = () => {
    navigator.clipboard?.writeText(SHARE_URL).catch(() => {});
    toast("已複製連結 ✓");
    onClose();
  };

  const saveImage = () => {
    toast("圖片已儲存 ✓（示意）");
    onClose();
  };

  return (
    <>
      <div className="sh-sheet-backdrop" onClick={onClose} />
      <div className="sh-sheet">
        <div className="sh-sheet-handle" />

        {/* Title */}
        <div>
          <div className="sh-sheet-title">{isWeek ? "找我建議" : "分享今日行程"}</div>
          <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:3 }}>
            對方看到的樣子
          </div>
        </div>

        {/* ── Preview card ── */}
        <div className="sh-preview">
          {/* Header */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1rem", color:"var(--text)" }}>
              Can we…?
            </div>
            <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginTop:1 }}>
              {isWeek ? getWeekHeader() : `${weekday}｜${dateLabel}`}
            </div>
          </div>

          {isWeek ? (
            /* 找我建議 — ranked by free time */
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(() => {
                const rec = getWeekRecommendations(weekEvents, 8, 22);
                const sections = [
                  { label:"🟢 最推薦",  days: rec.best, color:"var(--c-free)"    },
                  { label:"🟢 推薦",    days: rec.good, color:"var(--c-reply)"   },
                  { label:"🟡 可以找",  days: rec.ok,   color:"var(--c-reply)"   },
                  { label:"🔴 較不建議",days: rec.busy, color:"var(--c-busy)"    },
                ].filter(s => s.days.length > 0);
                return sections.map(sec => (
                  <div key={sec.label}>
                    <div style={{ fontSize:"0.72rem", fontWeight:500, color:sec.color,
                      marginBottom:5, letterSpacing:"0.04em" }}>
                      {sec.label}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {sec.days.map(d => (
                        <div key={d.di} style={{
                          padding:"5px 12px", borderRadius:99,
                          background:"var(--surface2)", border:"1px solid var(--border2)",
                          fontSize:"0.8rem", fontFamily:"var(--font-b)", color:"var(--text)",
                        }}>
                          週{WEEK_DAYS[d.di]}
                          {d.freeH > 0 && <span style={{ color:"var(--muted)", marginLeft:4 }}>{d.freeH}h空閒</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <>
              {/* Mini timeline */}
              <div style={{ marginBottom:12 }}>
                <TimelineBar blocks={blocks} />
              </div>

              {/* Status blocks */}
              {daytime.length === 0 ? (
                <div style={{ fontSize:"0.82rem", color:"var(--muted2)", textAlign:"center", padding:"8px 0" }}>
                  今天沒有行程
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {daytime.map((b, i) => {
                    const s = STATUS[b.status];
                    return (
                      <div key={i} className="sh-preview-row"
                        style={{ background: s.bg, borderRadius:8, padding:"9px 12px", border:`1px solid ${s.color}22` }}>
                        <Pip status={b.status} size="sm" />
                        <span className="sh-preview-time">{fmt(b.start)}–{fmt(b.end)}</span>
                        <span className="sh-preview-lbl" style={{ color: s.color }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Privacy note */}
          <div style={{
            marginTop:10, fontSize:"0.67rem", color:"var(--muted2)",
            borderTop:`1px solid var(--border)`, paddingTop:8, lineHeight:1.6,
          }}>
            🔒 不顯示事件名稱與備註
          </div>
        </div>

        {/* Action buttons */}
        <div className="btn-row">
          <button className="btn btn-g" onClick={copyLink}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            複製連結
          </button>
          <button className="btn btn-p" onClick={saveImage}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            存成圖片
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Page: Home ────────────────────────────────────────────────────
function HomePage({ events, displayRange, setTab, toast }) {
  const [shareOpen, setShareOpen] = useState(false);
  const todayEvs = events.filter(ev => !ev.date || ev.date === dateStr());
  const blocks   = buildBlocks(todayEvs);
  const nowHour  = new Date().getHours();
  const nowMins  = new Date().getMinutes();
  const nowBlock = blocks.find(b => nowHour >= b.start && nowHour < b.end);
  const nowStatus = nowBlock?.status ?? "offline";
  const s = STATUS[nowStatus];

  const sorted    = [...todayEvs].sort((a,b) => new Date(a.startTime)-new Date(b.startTime));
  const currentEv = sorted.find(ev => {
    const sh = new Date(ev.startTime).getHours();
    const eh = new Date(ev.endTime).getHours();
    return nowHour >= sh && nowHour < eh;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 64px)", overflow:"hidden" }}>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", padding:"28px 22px 8px" }}>

        {/* Date header */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1.5rem", letterSpacing:"-0.01em" }}>今天</div>
          <div style={{ fontSize:"0.82rem", color:"var(--muted)", marginTop:2 }}>{fmtDateLabel()}</div>
        </div>

        {/* Status card */}
        <div className="card" style={{ marginBottom:14 }}>
          <div className="card-label">現在</div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Pip status={nowStatus} size="md" />
            <div>
              <div style={{ fontFamily:"var(--font-b)", fontWeight:500, fontSize:"1.4rem", letterSpacing:"-0.01em", color:s.color }}>
                {s.label}
              </div>
              {nowBlock && nowStatus !== "offline" && (
                <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                  到 {fmt(nowBlock.end)} 為止{currentEv && ` · ${currentEv.title}`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mini timeline */}
        <div className="card" style={{ padding:"14px 18px", marginBottom:14 }}>
          <TimelineBar blocks={blocks} />
        </div>

        {/* Today full schedule */}
        {sorted.length > 0 && (
          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-label" style={{ marginBottom:10 }}>今日行程</div>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {sorted.map((ev, i) => {
                const es = STATUS[ev.status];
                const isPast = new Date(ev.endTime) < new Date();
                return (
                  <div key={ev.id} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"9px 0",
                    borderBottom: i < sorted.length-1 ? "1px solid var(--border)" : "none",
                    opacity: isPast ? 0.45 : 1,
                  }}>
                    <Pip status={ev.status} size="sm" />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:"0.88rem", fontWeight:500, color:"var(--text)" }}>{ev.title}</div>
                      <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:1, fontVariantNumeric:"tabular-nums" }}>
                        {fmtTime(ev.startTime)} – {fmtTime(ev.endTime)}
                      </div>
                    </div>
                    <div style={{ fontSize:"0.72rem", color:es.color, fontWeight:500 }}>{es.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pinned bottom action bar — no border, lifted from edge */}
      <div style={{
        flexShrink:0, padding:"10px 22px 20px",
        background:"var(--bg)",
        display:"flex", gap:10,
      }}>
        <button className="btn btn-p" style={{ flex:1 }} onClick={() => setTab("行程")}>
          📋 管理行程
        </button>
        <button className="btn btn-g" style={{ flex:1 }} onClick={() => setShareOpen(true)}>
          ↗ 分享
        </button>
      </div>

      {shareOpen && <ShareSheet events={events} toast={toast} mode="today" onClose={() => setShareOpen(false)} />}
    </div>
  );
}

// ─── Day View ──────────────────────────────────────────────────────
const PX_PER_HR = 36;  // pixels per hour in timeline
const SNAP_MINS = 15;  // drag snap resolution
function minsToTimeStr(m) {
  const h = Math.floor(m / 60), min = m % 60;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}
function isoToMins(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function minsToISO(mins) {
  const today = new Date().toISOString().slice(0,10);
  return new Date(`${today}T${minsToTimeStr(mins)}:00`).toISOString();
}

// ─── DayView — extracted to components/DayView.jsx ────────────────
// ─── DayView — split into DayView.jsx + DayTimeline.jsx + DayEvent.jsx + useDayDrag.js ──
// In multi-file project: import DayView from './DayView.jsx'
// Inline below for single-file build compatibility.
function DayView({ events, setEvents, onEdit, rangeStart = 8, rangeEnd = 22 }) {
  const colRef       = useRef(null);
  const containerRef = useRef(null);
  const dragRef      = useRef(null);

  const PX       = PX_PER_HR;
  const totalHrs = rangeHours(rangeStart, rangeEnd);
  const totalH   = totalHrs * PX;

  // Convert absolute minutes to pixel Y (cross-day aware)
  const toY = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    let offset = h - rangeStart;
    if (offset < 0) offset += 24;
    const minOffset = (mins % 60) / 60;
    return (offset + minOffset) * PX;
  };

  const nowH    = new Date().getHours();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const nowOff  = hourToOffset(nowH, rangeStart, totalHrs);
  const nowY    = nowOff !== null ? toY(nowMins) : -1;

  // Visible hours array (handles cross-day wraparound)
  const hours = Array.from({ length: totalHrs + 1 }, (_, i) => (rangeStart + i) % 24);

  useEffect(() => {
    if (containerRef.current && nowY > 0) {
      containerRef.current.scrollTop = Math.max(0, nowY - 80);
    }
  }, [rangeStart]);

  const startDrag = (e, type, ev) => {
    e.preventDefault(); e.stopPropagation();
    const startY    = e.touches ? e.touches[0].clientY : e.clientY;
    const origStart = isoToMins(ev.startTime);
    const origEnd   = isoToMins(ev.endTime);
    dragRef.current = { type, evId: ev.id, startY, origStart, origEnd };

    const onMove = (me) => {
      if (!dragRef.current) return;
      const clientY = me.touches ? me.touches[0].clientY : me.clientY;
      const dy = clientY - dragRef.current.startY;
      const dMins = Math.round((dy / PX) * 60 / SNAP_MINS) * SNAP_MINS;
      const { type, evId, origStart, origEnd } = dragRef.current;
      const duration = (origEnd - origStart + 1440) % 1440;
      setEvents(prev => prev.map(ev => {
        if (ev.id !== evId) return ev;
        let ns = origStart, ne = origEnd;
        if (type === 'move') {
          ns = (origStart + dMins + 1440) % 1440;
          ne = (ns + duration) % 1440;
        } else if (type === 'top') {
          ns = (origStart + dMins + 1440) % 1440;
        } else if (type === 'bottom') {
          ne = (origEnd + dMins + 1440) % 1440;
        }
        return { ...ev, startTime: minsToISO(ns), endTime: minsToISO(ne) };
      }));
    };

    const onEnd = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onEnd);
    };
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup',   onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend',  onEnd);
  };

  return (
    <div className="dv-container" ref={containerRef}>
      <div className="dv-wrap" style={{ height: totalH }}>
        <div className="dv-time-col" style={{ height: totalH }}>
          {hours.map((h, i) => (
            <div key={i} className="dv-hour-lbl" style={{ top: i * PX }}>
              {String(h).padStart(2,'0')}
            </div>
          ))}
        </div>
        <div className="dv-col" ref={colRef} style={{ height: totalH }}>
          {hours.map((h, i) => (
            <div key={i}>
              <div className="dv-gridline" style={{ top: i * PX }} />
              {i < totalHrs && <div className="dv-gridline half" style={{ top: i * PX + PX / 2 }} />}
            </div>
          ))}
          {nowY >= 0 && (
            <div className="dv-now-line" style={{ top: nowY }}>
              <div className="dv-now-dot" />
            </div>
          )}
          {events.map(ev => {
            const startM = isoToMins(ev.startTime);
            const startH = new Date(ev.startTime).getHours();
            const offStart = hourToOffset(startH, rangeStart, totalHrs);
            if (offStart === null) return null;
            const endM   = isoToMins(ev.endTime);
            const top    = toY(startM);
            const endTop = toY(endM);
            const height = Math.max(endTop > top ? endTop - top : totalH - top + endTop, 24);
            const s      = STATUS[ev.status];
            return (
              <div key={ev.id} className="dv-event"
                style={{ top, height, background: s.bg, borderColor: s.color }}
                onMouseDown={e => startDrag(e, 'move', ev)}
                onTouchStart={e => startDrag(e, 'move', ev)}
                onDoubleClick={e => { e.stopPropagation(); onEdit(ev); }}>
                <div className="dv-resize top"
                  onMouseDown={e => startDrag(e, 'top', ev)}
                  onTouchStart={e => startDrag(e, 'top', ev)} />
                <div className="dv-event-title" style={{ color: s.color }}>{ev.title}</div>
                {height > 36 && (
                  <div className="dv-event-time">
                    {minsToTimeStr(startM)} – {minsToTimeStr(endM)}
                  </div>
                )}
                <div className="dv-resize bottom"
                  onMouseDown={e => startDrag(e, 'bottom', ev)}
                  onTouchStart={e => startDrag(e, 'bottom', ev)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page: Events ──────────────────────────────────────────────────
function EventsPage({ events, setEvents, displayRange, weekStart = 0, toast }) {
  const [modal, setModal]         = useState(null);
  const [view, setView]           = useState("day");
  const [viewDate, setViewDate]   = useState(dateStr());
  const [shareOpen, setShareOpen] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null); // date string for expanded day in week/month

  const dayEvents  = events.filter(ev => !ev.date || ev.date === viewDate);
  const weekEvents = buildWeekEvents(events, weekStart);
  const todayStr   = dateStr();

  const handleSave = (ev) => {
    const saved = { ...ev, date: ev.date || viewDate };
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const n=[...prev]; n[idx]=saved; return n; }
      return [...prev, saved];
    });
    toast(modal?.id ? "已更新 ✓" : "已新增 ✓");
    setModal(null);
  };

  const handleDelete = (id) => { setEvents(prev => prev.filter(e => e.id !== id)); toast("已刪除"); };

  // Week: toggle expand, no navigation
  const handleWeekCellClick = (weekDayIdx) => {
    const today = new Date();
    const monOffset = -((today.getDay() + 6) % 7);
    const d = new Date(today); d.setDate(today.getDate() + monOffset + weekDayIdx);
    const ds = dateStr(d);
    setExpandedDay(prev => prev === ds ? null : ds);
  };

  // Month: toggle expand, no navigation
  const handleMonthCellClick = (cell) => {
    if (cell.otherMonth) return;
    setExpandedDay(prev => prev === cell.date ? null : cell.date);
    setViewDate(cell.date);
  };

  const shiftDay = (n) => { const d = new Date(viewDate); d.setDate(d.getDate() + n); setViewDate(dateStr(d)); };
  const shiftWeek = (n) => {
    const today = new Date();
    const monOffset = -((today.getDay() + 6) % 7);
    const mon = new Date(today); mon.setDate(today.getDate() + monOffset + n * 7);
    setViewDate(dateStr(mon));
    setExpandedDay(null);
  };
  const shiftMonth = (n) => {
    const d = new Date(viewDate + "T12:00:00"); d.setMonth(d.getMonth() + n);
    setViewDate(dateStr(d));
    setExpandedDay(null);
  };

  const isToday = viewDate === todayStr;
  const vd = new Date(viewDate + "T12:00:00");

  const dayLabel = vd.toLocaleDateString("zh-TW", { month:"numeric", day:"numeric", weekday:"short" });
  const weekLabel = (() => {
    const today = new Date();
    const monOffset = -((today.getDay() + 6) % 7);
    const mon = new Date(today); mon.setDate(today.getDate() + monOffset);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const f = d => `${d.getMonth()+1}/${d.getDate()}`;
    return `${f(mon)} – ${f(sun)}`;
  })();
  const monthLabel = vd.toLocaleDateString("zh-TW", { year:"numeric", month:"long" });

  const navLabel = view === "day" ? dayLabel : view === "week" ? weekLabel : monthLabel;
  const onPrev   = view === "day" ? () => shiftDay(-1) : view === "week" ? () => shiftWeek(-1) : () => shiftMonth(-1);
  const onNext   = view === "day" ? () => shiftDay(1)  : view === "week" ? () => shiftWeek(1)  : () => shiftMonth(1);

  // Month view cells
  const monthCells = (() => {
    const d = new Date(viewDate + "T12:00:00");
    const year = d.getFullYear(); const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) {
      const pd = new Date(year, month, -startDow + i + 1);
      cells.push({ date: dateStr(pd), day: pd.getDate(), otherMonth: true });
    }
    for (let d2 = 1; d2 <= daysInMonth; d2++) {
      const dd = new Date(year, month, d2);
      cells.push({ date: dateStr(dd), day: d2, otherMonth: false });
    }
    while (cells.length % 7 !== 0) {
      const nd = new Date(year, month+1, cells.length - startDow - daysInMonth + 1);
      cells.push({ date: dateStr(nd), day: nd.getDate(), otherMonth: true });
    }
    return cells;
  })();

  // Day detail panel — shown in week/month when a day is expanded
  const DayDetail = ({ date }) => {
    const evs = events.filter(ev => ev.date === date).sort((a,b) => new Date(a.startTime)-new Date(b.startTime));
    const blocks = buildBlocks(evs);
    const visibleBlocks = blocks.filter(b => b.status !== "offline" && b.end > displayRange.start && b.start < displayRange.end);
    const dl = new Date(date + "T12:00:00").toLocaleDateString("zh-TW", { month:"numeric", day:"numeric", weekday:"short" });
    return (
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px", marginTop:8 }}>
        <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginBottom:10, fontWeight:500 }}>{dl}</div>
        {visibleBlocks.length === 0 ? (
          <div style={{ fontSize:"0.8rem", color:"var(--muted2)" }}>無行程</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {visibleBlocks.map((b, i) => {
              const s = STATUS[b.status];
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Pip status={b.status} size="sm" />
                  <span style={{ fontSize:"0.78rem", color:"var(--muted)", fontVariantNumeric:"tabular-nums", minWidth:90 }}>
                    {fmt(b.start)}:00 – {fmt(b.end)}:00
                  </span>
                  <span style={{ fontSize:"0.82rem", fontWeight:500, color:s.color }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const shareMode = view === "week" || view === "month" ? "week" : "today";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 64px)", overflow:"hidden" }}>

      {/* Toggle + date nav */}
      <div style={{ padding:"12px 22px 0", flexShrink:0, display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ display:"flex", justifyContent:"center" }}>
          <div className="view-toggle">
            {["day","week","month"].map((v) => (
              <button key={v} className={`view-toggle-btn ${view===v?"on":""}`}
                onClick={() => { setView(v); setExpandedDay(null); }}>
                {{"day":"日","week":"週","month":"月"}[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="date-nav-row">
          <button className="date-nav-btn" onClick={onPrev}>‹</button>
          <div className="date-nav-label">{navLabel}</div>
          <button className="date-nav-btn" onClick={onNext}>›</button>
          {!isToday && view === "day" && (
            <button onClick={() => setViewDate(todayStr)}
              style={{ fontSize:"0.7rem", color:"var(--accent)", background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>
              今天
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>

        {/* Day view */}
        {view === "day" && (
          <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", padding:"0 12px 4px" }}>
            <DayView events={dayEvents} setEvents={setEvents} onEdit={ev => setModal(ev)}
              rangeStart={displayRange.start} rangeEnd={displayRange.end} />
          </div>
        )}

        {/* Week view — click expands inline, no navigation */}
        {view === "week" && (
          <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"8px 22px 16px" }}>
            <WeekGrid weekEvents={weekEvents} rangeStart={displayRange.start} rangeEnd={displayRange.end}
              onDayClick={handleWeekCellClick} weekStart={weekStart}
              expandedDay={expandedDay}
              getExpandDate={(di) => {
                const today = new Date();
                const dow = (today.getDay() + 6) % 7;
                let offset = dow - weekStart;
                if (offset < 0) offset += 7;
                const d = new Date(today);
                d.setDate(today.getDate() - offset + di);
                return dateStr(d);
              }}
            />
          </div>
        )}

        {/* Month view — click shows detail below calendar */}
        {view === "month" && (
          <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"8px 16px 16px" }}>
            <div className="mv-grid">
              {["一","二","三","四","五","六","日"].map(d => (
                <div key={d} className="mv-day-hdr">週{d}</div>
              ))}
              {monthCells.map((cell, i) => {
                const cellEvents = events.filter(ev => ev.date === cell.date);
                const dots = cellEvents.slice(0,3);
                const isExpanded = cell.date === expandedDay;
                return (
                  <div key={i}
                    className={`mv-cell ${cell.date === todayStr ? "today" : ""} ${cell.otherMonth ? "other-month" : ""} ${isExpanded ? "mv-selected" : ""}`}
                    onClick={() => handleMonthCellClick(cell)}>
                    <div className="mv-date">{cell.day}</div>
                    {dots.length > 0 && (
                      <div className="mv-dots">
                        {dots.map((ev,j) => (
                          <div key={j} className="mv-dot" style={{ background: STATUS[ev.status]?.color || "var(--muted2)" }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Day detail below calendar */}
            {expandedDay && <DayDetail date={expandedDay} />}
          </div>
        )}
      </div>

      {/* Share button */}
      <div style={{ position:"absolute", top:12, right:22, zIndex:10 }}>
        <button className="btn-outline" style={{ fontSize:"0.75rem", padding:"5px 10px" }}
          onClick={() => setShareOpen(shareMode)}>↗ 分享</button>
      </div>

      <button className="fab" onClick={() => setModal("add")} title="新增事件">＋</button>

      {modal && <EventModal event={modal==="add"?{ date:viewDate }:modal} onSave={handleSave} onClose={() => setModal(null)} />}
      {shareOpen && <ShareSheet events={events} toast={toast} mode={shareOpen} onClose={() => setShareOpen(null)} />}
    </div>
  );
}


// ─── Google Calendar Service ───────────────────────────────────────
// In multi-file project: import { GoogleCalendarService } from './GoogleCalendarService.js'
// In multi-file project: import GoogleCalendarImport from './GoogleCalendarImport.jsx'
//
// Inline stub — mirrors GoogleCalendarService.js exports exactly.
// OAuth / fetch / convert / dedup logic lives in GoogleCalendarService.js.
// Main app (Home, DayView, WeekView, EventModal) never references this directly.
const GoogleCalendarService = (() => {
  function _todayAt(h) { const d = new Date(); d.setHours(h,0,0,0); return d.toISOString(); }
  let _counter = 1000;

  async function connect(existingEvents = [], rules = []) {
    // TODO: replace with real OAuth → _oauthConnect() in GoogleCalendarService.js
    const raw = await new Promise(resolve => setTimeout(() => resolve([
      { gcalId:"gc1", title:"社區訪視",   startTime:_todayAt(9),  endTime:_todayAt(12) },
      { gcalId:"gc2", title:"個案會議",   startTime:_todayAt(13), endTime:_todayAt(15) },
      { gcalId:"gc3", title:"寫個案紀錄", startTime:_todayAt(15), endTime:_todayAt(17) },
      { gcalId:"gc4", title:"自由時間",   startTime:_todayAt(19), endTime:_todayAt(21) },
    ]), 1400));
    const proposed = raw.map(ev => ({
      id: "gcal_" + (++_counter), gcalId: ev.gcalId, title: ev.title,
      date: dateStr(new Date(ev.startTime)), startTime: ev.startTime,
      endTime: ev.endTime, note: "", status: guessStatus(ev.title), source: "google",
    }));
    const importedIds = new Set(existingEvents.filter(e => e.source === "google").map(e => e.gcalId));
    return proposed.filter(ev => !importedIds.has(ev.gcalId));
  }

  function adjustStatus(proposed, gcalId, status) {
    return proposed.map(ev => ev.gcalId === gcalId ? { ...ev, status } : ev);
  }

  function disconnect() {}

  return { connect, adjustStatus, disconnect };
})();

// ─── Settings sub-pages ────────────────────────────────────────────

// Shared back button
function SettingsBack({ onBack, title }) {
  return (
    <div style={{ marginBottom:18 }}>
      <button className="settings-back" onClick={onBack}>
        ← 設定
      </button>
      <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1.3rem" }}>{title}</div>
    </div>
  );
}

// Sub-page: 狀態管理
function StatusSettings({ onBack, toast }) {
  const [statuses, setStatuses] = useState(
    STATUS_KEYS.map(k => ({ key: k, label: STATUS[k].label, desc: "" }))
  );
  const set = (k, field, val) =>
    setStatuses(s => s.map(x => x.key === k ? { ...x, [field]: val } : x));

  return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={onBack} title="狀態管理" />
      <div className="card">
        <div style={{ fontSize:"0.72rem", color:"var(--muted2)", marginBottom:14, lineHeight:1.6 }}>
          自訂每個狀態的名稱與說明。名稱會顯示在分享頁和行程卡片上。
        </div>
        {statuses.map(({ key, label, desc }) => {
          const s = STATUS[key];
          return (
            <div key={key} className="status-editor-row">
              <div className="status-color-dot" style={{ background: s.color }} />
              <div style={{ flex:1 }}>
                <input className="status-name-input" value={label}
                  onChange={e => set(key, "label", e.target.value)}
                  placeholder={STATUS[key].label} />
                <input className="status-desc-input" value={desc}
                  onChange={e => set(key, "desc", e.target.value)}
                  placeholder="說明文字（選填，例：正在開會，請稍後聯繫）" />
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-p" style={{ alignSelf:"flex-start", flex:"none", padding:"11px 28px" }} onClick={() => toast("已儲存 ✓")}>儲存</button>
    </div>
  );
}

// Sub-page: 關鍵字規則
function KeywordSettings({ rules, setRules, onBack, toast }) {
  const [newKw, setNewKw] = useState("");
  const STATUS_OPTIONS = STATUS_KEYS.map(k => ({ value: k, label: `${STATUS[k].emoji} ${STATUS[k].label}` }));

  const addRule = () => {
    if (!newKw.trim()) return;
    setRules(rs => [...rs, { id: newId(), keyword: newKw.trim(), status: "busy" }]);
    setNewKw("");
    toast("已新增 ✓");
  };

  const deleteRule = (id) => setRules(rs => rs.filter(r => r.id !== id));

  return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={onBack} title="關鍵字規則" />
      <div className="card">
        <div className="card-label" style={{ marginBottom:10 }}>自動分類規則</div>
        <div style={{ fontSize:"0.72rem", color:"var(--muted2)", marginBottom:14, lineHeight:1.6 }}>
          匯入 Google Calendar 時自動推薦狀態。手動設定優先權最高。
        </div>
        {rules.map((r, i) => (
          <div key={r.id} className="rule-row">
            <span className="rule-kw">{r.keyword}</span>
            <span className="rule-arr">→</span>
            <select className="sel" value={r.status}
              onChange={e => setRules(rs => rs.map((x,j) => j===i ? {...x, status:e.target.value} : x))}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="ev-action-btn" onClick={() => deleteRule(r.id)} style={{ marginLeft:4 }}>✕</button>
          </div>
        ))}
        {/* Add new keyword */}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <input className="input" style={{ flex:1, padding:"8px 12px", fontSize:"0.85rem" }}
            placeholder="新增關鍵字…" value={newKw}
            onChange={e => setNewKw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addRule()} />
          <button className="btn btn-g" style={{ flex:"none", padding:"8px 14px" }} onClick={addRule}>新增</button>
        </div>
      </div>
    </div>
  );
}

// Sub-page: 顯示時間範圍
function TimeRangeSettings({ displayRange, setDisplayRange, onBack, toast }) {
  const [start, setStart] = useState(displayRange.start);
  const [end,   setEnd]   = useState(displayRange.end);

  const isCrossDay  = end <= start;
  const hoursCount  = isCrossDay ? (24 - start) + end : end - start;
  const valid       = hoursCount >= 1 && hoursCount <= 23;

  const save = async () => {
    if (!valid) { toast("時間範圍無效"); return; }
    const range = { start, end };
    setDisplayRange(range);
    await saveRange(range);
    toast("已套用 ✓");
    onBack();
  };

  return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={onBack} title="顯示時間範圍" />
      <div className="card">
        <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginBottom:16, lineHeight:1.6 }}>
          設定日視圖和週視圖顯示的時間範圍。支援跨日（晚上開始、隔日結束）。
        </div>
        <div className="time-range-row">
          <span className="time-range-label">開始</span>
          <select className="time-range-select" value={start} onChange={e => setStart(Number(e.target.value))}>
            {Array.from({length:24},(_,h) => (
              <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>
            ))}
          </select>
        </div>
        <div className="time-range-row">
          <span className="time-range-label">結束</span>
          <select className="time-range-select" value={end} onChange={e => setEnd(Number(e.target.value))}>
            {Array.from({length:24},(_,h) => (
              <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>
            ))}
          </select>
        </div>
        <div style={{
          fontSize:"0.76rem", padding:"8px 12px", borderRadius:8,
          background: isCrossDay ? "#B7A46A18" : "var(--surface2)",
          color: isCrossDay ? "var(--c-reply)" : "var(--muted2)",
          lineHeight:1.7,
        }}>
          {isCrossDay
            ? `🌙 跨日模式：${String(start).padStart(2,"0")}:00 → 隔日 ${String(end).padStart(2,"0")}:00（共 ${hoursCount} 小時）`
            : `${String(start).padStart(2,"0")}:00 – ${String(end).padStart(2,"0")}:00（共 ${hoursCount} 小時）`}
        </div>
      </div>
      <button className="btn btn-p" style={{ alignSelf:"flex-start", flex:"none", padding:"11px 28px" }}
        onClick={save} disabled={!valid}>套用</button>
    </div>
  );
}

// Sub-page: Google Calendar 匯入
// GcalSettings is a thin shell — all logic lives in:
//   GoogleCalendarService.js  (OAuth, fetch, convert, dedup)
//   GoogleCalendarImport.jsx  (UI states: idle/connecting/preview/imported)
// This function only wires onImport → setEvents.
function GcalSettings({ events, setEvents, onBack, toast }) {
  const [gcalState, setGcalState] = useState("idle");
  const [preview, setPreview]     = useState([]);

  const connectGoogle = async () => {
    setGcalState("connecting");
    try {
      const proposed = await GoogleCalendarService.connect(events, []);
      setPreview(proposed);
      setGcalState("preview");
    } catch (_) {
      setGcalState("idle");
      toast("連結失敗，請重試");
    }
  };

  const handleAdjustStatus = (gcalId, status) =>
    setPreview(p => GoogleCalendarService.adjustStatus(p, gcalId, status));

  const confirmImport = () => {
    setEvents(prev => [...prev, ...preview]);  // ← only line that touches App state
    setGcalState("imported");
    toast(`已匯入 ${preview.length} 個事件 ✓`);
  };

  const disconnect = () => { GoogleCalendarService.disconnect(); setGcalState("idle"); setPreview([]); };

  const STATUS_OPTIONS = STATUS_KEYS.map(k => ({ value: k, label: `${STATUS[k].emoji} ${STATUS[k].label}` }));

  return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={onBack} title="Google Calendar 匯入" />

      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-label">同步策略</div>
        {[
          ["1", "連結 Google Calendar", "授權讀取行事曆事件（只讀取，不回寫）"],
          ["2", "匯入事件，推薦狀態",   "依關鍵字規則推薦，匯入前可手動調整"],
          ["3", "在 CanWe 自由編輯",    "修改只在 CanWe 內生效，不影響 Google Calendar"],
        ].map(([n, t, d]) => (
          <div key={n} className="gcal-import-step">
            <div className="gcal-step-num">{n}</div>
            <div className="gcal-step-body">
              <div className="gcal-step-title">{t}</div>
              <div className="gcal-step-desc">{d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        {gcalState === "idle" && (
          <button className="gcal-connect-btn" onClick={connectGoogle}>
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            連結 Google 行事曆
          </button>
        )}
        {gcalState === "connecting" && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 0", color:"var(--muted)", fontSize:"0.86rem" }}>
            <div className="spinner" /> 讀取行事曆事件中…
          </div>
        )}
        {gcalState === "preview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:"0.8rem", color:"var(--muted)", lineHeight:1.6 }}>
              找到 {preview.length} 個事件，匯入前可調整狀態：
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {preview.map(ev => {
                const s = STATUS[ev.status];
                return (
                  <div key={ev.gcalId} style={{ border:`1px solid ${s.color}28`, borderRadius:10, background:s.bg, padding:"10px 12px", display:"flex", flexDirection:"column", gap:7 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:"0.88rem", fontWeight:500 }}>{ev.title}</div>
                        <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:1, fontVariantNumeric:"tabular-nums" }}>
                          {fmtTime(ev.startTime)} – {fmtTime(ev.endTime)}
                        </div>
                      </div>
                      <Pip status={ev.status} size="sm" />
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {STATUS_KEYS.map(k => {
                        const ks = STATUS[k]; const sel = ev.status === k;
                        return (
                          <button key={k} onClick={() => handleAdjustStatus(ev.gcalId, k)}
                            style={{ border:`1px solid ${sel ? ks.color : "var(--border2)"}`, background:sel ? ks.bg : "var(--surface)", color:sel ? ks.color : "var(--muted)", borderRadius:7, padding:"3px 9px", fontSize:"0.72rem", fontFamily:"var(--font-b)", cursor:"pointer", fontWeight:sel?500:400, transition:"all 0.14s" }}>
                            {ks.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="btn-row">
              <button className="btn btn-g" onClick={disconnect}>取消</button>
              <button className="btn btn-p" onClick={confirmImport}>確認匯入</button>
            </div>
          </div>
        )}
        {gcalState === "imported" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div className="gcal-connected">
              <Pip status="free" size="sm" />
              <div>
                <div style={{ fontSize:"0.86rem", fontWeight:500 }}>已連結 Google 行事曆</div>
                <div style={{ fontSize:"0.73rem", color:"var(--muted)", marginTop:2 }}>demo@gmail.com · 剛剛同步</div>
              </div>
            </div>
            <div className="gcal-notice">
              ✏️ 匯入的事件可在「行程」頁編輯。修改只在 CanWe 內生效。
            </div>
            <button className="btn-outline" style={{ alignSelf:"flex-start" }} onClick={disconnect}>取消連結</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main settings menu ────────────────────────────────────────────
// ─── Settings sub-page: 固定排程 ──────────────────────────────────
const WEEKDAYS = ["一","二","三","四","五","六","日"];
const WEEKDAY_FULL = ["週一","週二","週三","週四","週五","週六","週日"];
const HOURS = Array.from({length:24},(_,h)=>h);

const DEFAULT_RECURRING = []; // { id, title, days:[0-6], startTime:"HH:MM", endTime:"HH:MM", status }

function RecurringSettings({ recurring, setRecurring, onBack, toast }) {
  const [editing, setEditing] = useState(null); // null | "new" | schedule object

  const blankForm = () => ({
    id: newId(), title: "", days: [0,1,2,3,4], // Mon–Fri default
    startTime: "12:00", endTime: "13:00", status: "free",
  });

  const [form, setForm] = useState(blankForm());
  const setF = (k,v) => setForm(f => ({...f,[k]:v}));

  const toggleDay = (d) => {
    setF("days", form.days.includes(d)
      ? form.days.filter(x=>x!==d)
      : [...form.days, d].sort());
  };

  const openNew = () => { setForm(blankForm()); setEditing("new"); };
  const openEdit = (s) => { setForm({...s}); setEditing(s); };

  const save = () => {
    if (!form.title.trim() || form.days.length === 0) {
      toast("請填寫名稱並選擇星期"); return;
    }
    const entry = { ...form, title: form.title.trim() };
    setRecurring(rs => {
      const idx = rs.findIndex(r => r.id === entry.id);
      if (idx >= 0) { const n=[...rs]; n[idx]=entry; return n; }
      return [...rs, entry];
    });
    toast("已儲存 ✓");
    setEditing(null);
  };

  const del = (id) => {
    setRecurring(rs => rs.filter(r => r.id !== id));
    toast("已刪除");
  };

  const STATUS_OPTIONS = STATUS_KEYS.map(k => ({ value:k, label:`${STATUS[k].emoji} ${STATUS[k].label}` }));

  // ── Edit form ──
  if (editing) return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={() => setEditing(null)} title={editing==="new"?"新增固定排程":"編輯固定排程"} />

      <div className="card" style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {/* Title */}
        <div className="field">
          <div className="field-label">名稱</div>
          <input className="input" placeholder="例：午休、晨會、固定訪視…" value={form.title}
            onChange={e => setF("title", e.target.value)} />
        </div>

        {/* Weekday selector */}
        <div className="field">
          <div className="field-label">重複星期</div>
          <div className="recur-days">
            {WEEKDAYS.map((d,i) => (
              <button key={i} className={`recur-day-btn ${form.days.includes(i)?"on":""}`}
                onClick={() => toggleDay(i)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="field">
          <div className="field-label">時間</div>
          <div className="recur-time-row">
            <select className="recur-time-sel" value={form.startTime}
              onChange={e => setF("startTime", e.target.value)}>
              {HOURS.flatMap(h => ["00","15","30","45"].map(m => {
                const v = `${String(h).padStart(2,"0")}:${m}`;
                return <option key={v} value={v}>{v}</option>;
              }))}
            </select>
            <span className="recur-time-sep">–</span>
            <select className="recur-time-sel" value={form.endTime}
              onChange={e => setF("endTime", e.target.value)}>
              {HOURS.flatMap(h => ["00","15","30","45"].map(m => {
                const v = `${String(h).padStart(2,"0")}:${m}`;
                return <option key={v} value={v}>{v}</option>;
              }))}
            </select>
          </div>
        </div>

        {/* Status */}
        <div className="field">
          <div className="field-label">這段時間的狀態</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {STATUS_KEYS.map(k => {
              const s = STATUS[k]; const sel = form.status===k;
              return (
                <div key={k} onClick={() => setF("status",k)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:9,
                    border:`1px solid ${sel?s.color:"var(--border)"}`,
                    background: sel?s.bg:"var(--surface2)", cursor:"pointer", transition:"all 0.14s" }}>
                  <Pip status={k} size="sm" />
                  <span style={{ fontSize:"0.88rem", fontWeight:sel?500:400, color:sel?s.color:"var(--text)" }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-g" onClick={() => setEditing(null)}>取消</button>
        <button className="btn btn-p" onClick={save}>儲存</button>
      </div>
    </div>
  );

  // ── List view ──
  return (
    <div className="page" style={{ paddingTop:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <div>
          <button className="settings-back" onClick={onBack}>← 設定</button>
          <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1.3rem" }}>固定排程</div>
        </div>
        <button className="btn-outline" style={{ padding:"6px 14px", fontSize:"0.8rem" }} onClick={openNew}>＋ 新增</button>
      </div>

      {recurring.length === 0 ? (
        <div className="recur-empty">
          還沒有固定排程<br />
          <span style={{ fontSize:"0.78rem" }}>例如：每週一到五 12:00–13:30 午休</span>
        </div>
      ) : (
        <div className="card">
          {recurring.map(r => {
            const s = STATUS[r.status];
            return (
              <div key={r.id} className="recur-row" onClick={() => openEdit(r)} style={{ cursor:"pointer" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <Pip status={r.status} size="sm" />
                    <span style={{ fontSize:"0.9rem", fontWeight:500 }}>{r.title}</span>
                    <span style={{ fontSize:"0.76rem", color:s.color }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize:"0.76rem", color:"var(--muted)", marginBottom:5 }}>
                    {r.startTime} – {r.endTime}
                  </div>
                  <div className="recur-tag">
                    {r.days.map(d => (
                      <span key={d} className="recur-tag-chip">{WEEKDAY_FULL[d]}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <button className="ev-action-btn" onClick={e => { e.stopPropagation(); del(r.id); }}>✕</button>
                  <span style={{ color:"var(--muted2)", fontSize:"0.85rem" }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize:"0.72rem", color:"var(--muted2)", lineHeight:1.7, padding:"0 2px" }}>
        固定排程會自動套用到每週對應的日期，可在行程頁手動覆蓋。
      </div>
    </div>
  );
}

// Sub-page: 週起始日
function WeekStartSettings({ weekStart, setWeekStart, onBack, toast }) {
  const DAY_OPTIONS = [
    { value: 0, label: "週一" },
    { value: 1, label: "週二" },
    { value: 2, label: "週三" },
    { value: 3, label: "週四" },
    { value: 4, label: "週五" },
    { value: 5, label: "週六" },
    { value: 6, label: "週日" },
  ];
  return (
    <div className="page" style={{ paddingTop:20 }}>
      <SettingsBack onBack={onBack} title="週起始日" />
      <div className="card">
        <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginBottom:14, lineHeight:1.6 }}>
          設定週視圖從哪天開始排列。
        </div>
        {DAY_OPTIONS.map(opt => (
          <div key={opt.value}
            onClick={() => { setWeekStart(opt.value); toast(`週起始日已設為 ${opt.label} ✓`); }}
            style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"13px 0", borderBottom:"1px solid var(--border)", cursor:"pointer",
            }}>
            <span style={{ fontSize:"0.9rem", fontWeight: weekStart === opt.value ? 500 : 400 }}>
              {opt.label}
            </span>
            {weekStart === opt.value && (
              <span style={{ color:"var(--accent)", fontSize:"1rem" }}>✓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPage({ rules, setRules, events, setEvents, displayRange, setDisplayRange, recurring, setRecurring, weekStart, setWeekStart, toast }) {
  const [sub, setSub] = useState(null);

  if (sub === "status")    return <StatusSettings    onBack={() => setSub(null)} toast={toast} />;
  if (sub === "keywords")  return <KeywordSettings   rules={rules} setRules={setRules} onBack={() => setSub(null)} toast={toast} />;
  if (sub === "timerange") return <TimeRangeSettings displayRange={displayRange} setDisplayRange={setDisplayRange} onBack={() => setSub(null)} toast={toast} />;
  if (sub === "weekstart") return <WeekStartSettings weekStart={weekStart} setWeekStart={setWeekStart} onBack={() => setSub(null)} toast={toast} />;
  if (sub === "gcal")      return <GcalSettings      events={events} setEvents={setEvents} onBack={() => setSub(null)} toast={toast} />;
  if (sub === "recurring") return <RecurringSettings recurring={recurring} setRecurring={setRecurring} onBack={() => setSub(null)} toast={toast} />;

  const MENU = [
    { key:"gcal",      title:"Google Calendar 匯入", desc:"連結並匯入行事曆事件" },
    { key:"recurring", title:"固定排程",             desc:`${recurring.length} 個固定排程` },
    { key:"status",    title:"狀態管理",             desc:"自訂狀態名稱與說明文字" },
    { key:"keywords",  title:"關鍵字規則",           desc:"匯入時自動推薦狀態" },
    { key:"weekstart",  title:"週起始日",             desc:`目前：週${["一","二","三","四","五","六","日"][weekStart]}` },
    { key:"timerange",  title:"顯示時間範圍",         desc:`目前 ${String(displayRange.start).padStart(2,"0")}:00 – ${String(displayRange.end).padStart(2,"0")}:00` },
  ];

  return (
    <div className="page" style={{ paddingTop:26 }}>
      <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1.4rem", marginBottom:20 }}>設定</div>
      <div className="settings-menu">
        {MENU.map(({ key, title, desc }) => (
          <div key={key} className="settings-row" onClick={() => setSub(key)}>
            <div className="settings-row-body">
              <div className="settings-row-title">{title}</div>
              <div className="settings-row-desc">{desc}</div>
            </div>
            <span className="settings-row-arrow">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bottom Nav icons — 3 tabs only ───────────────────────────────
const NAV_ITEMS = [
  { key:"首頁", label:"首頁", icon:()=>(
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9" strokeLinejoin="round"/>
    </svg>
  )},
  { key:"行程", label:"行程", icon:()=>(
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="4" width="18" height="18" rx="2" strokeLinejoin="round"/>
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth="2"/>
    </svg>
  )},
  { key:"設定", label:"設定", icon:()=>(
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round"/>
    </svg>
  )},
];

// ─── App root ──────────────────────────────────────────────────────
export default function CanWe() {
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [onboarded, setOnboarded]   = useState(true);   // assume done until storage says otherwise
  const [tab, setTab]               = useState("首頁");
  const [events, setEvents]         = useState(SEED_EVENTS);
  const [rules, setRules]           = useState(DEFAULT_RULES);
  const [recurring, setRecurring]   = useState(DEFAULT_RECURRING);
  const [weekStart, setWeekStart]   = useState(0); // 0=Mon..6=Sun
  const [displayRange, setDisplayRange] = useState({ start: 8, end: 22 }); // default 08–22
  const [toastMsg, setToastMsg]     = useState("");
  const [toastOn, setToastOn]       = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    injectCSS();

    // Load persisted range + onboarding flag from storage
    (async () => {
      const [wasOnboarded, savedRange] = await Promise.all([loadOnboarded(), loadRange()]);
      if (savedRange) setDisplayRange(savedRange);
      setOnboarded(wasOnboarded);
      setTimeout(() => setLoadingVisible(false), 2100);
    })();
  }, []);

  const toast = (msg) => {
    setToastMsg(msg); setToastOn(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2400);
  };

  const handleOnboardDone = (range) => {
    setDisplayRange(range);
    setOnboarded(true);
  };

  // Show onboarding after loading screen
  if (!loadingVisible && !onboarded) {
    return (
      <>
        <div className={`ls ${loadingVisible?"":"hidden"}`}>
          <div className="ls-title">Can we…?</div>
          <div className="ls-sub">讓時間自己說話</div>
          <div className="ls-pip" />
        </div>
        <Onboarding onDone={handleOnboardDone} />
      </>
    );
  }

  return (
    <>
      <div className={`ls ${loadingVisible?"":"hidden"}`}>
        <div className="ls-title">Can we…?</div>
        <div className="ls-sub">讓時間自己說話</div>
        <div className="ls-pip" />
      </div>

      <div className="app">
        {tab==="首頁" && <HomePage events={events} displayRange={displayRange} setTab={setTab} toast={toast} />}
        {tab==="行程" && <EventsPage events={events} setEvents={setEvents} displayRange={displayRange} weekStart={weekStart} toast={toast} />}
        {tab==="設定" && <SettingsPage rules={rules} setRules={setRules} events={events} setEvents={setEvents} displayRange={displayRange} setDisplayRange={setDisplayRange} recurring={recurring} setRecurring={setRecurring} weekStart={weekStart} setWeekStart={setWeekStart} toast={toast} />}
      </div>

      <nav className="bnav">
        {NAV_ITEMS.map(({ key, label, icon }) => (
          <button key={key} className={`bnav-tab ${tab===key?"on":""}`} onClick={() => setTab(key)}>
            {icon()}
            {label}
          </button>
        ))}
      </nav>

      <div className={`toast ${toastOn?"show":""}`}>{toastMsg}</div>
    </>
  );
}
