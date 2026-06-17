import { useState, useEffect, useRef } from "react";

// ─── v0.9.4 ────────────────────────────────────────────────────────
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
const STATUS = {
  busy:    { color: "#C98D86", label: "忙碌",      bg: "#C98D8614", barColor: "#C98D86", emoji: "🔴" },
  urgent:  { color: "#D6B183", label: "急事可聯繫", bg: "#D6B18314", barColor: "#D6B183", emoji: "🟠" },
  reply:   { color: "#C8BE97", label: "可回訊息",  bg: "#C8BE9714", barColor: "#C8BE97", emoji: "🟡" },
  free:    { color: "#8FA89D", label: "空閒",      bg: "#8FA89D14", barColor: "#8FA89D", emoji: "🟢" },
  offline: { color: "#B5AEA7", label: "休息中",    bg: "#B5AEA714", barColor: "#B5AEA7", emoji: "🌙" },
};
const STATUS_KEYS = ["busy", "urgent", "reply", "free", "offline"];
const PRIORITY = { busy: 5, urgent: 4, reply: 3, free: 2, offline: 1 };

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

const WEEK_DAYS = ["一","二","三","四","五","六","日"];
// Build array of 7 event-arrays for Mon–Sun of current week from real events
// Events are matched by date field (YYYY-MM-DD)
function buildWeekEvents(events) {
  const today = new Date();
  const dow   = today.getDay(); // 0=Sun
  const monOffset = -((dow + 6) % 7); // days from today to Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + monOffset + i);
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
  padding: 10px 4px 12px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  font-family: var(--font-b); font-size: 0.65rem; font-weight: 400;
  color: var(--muted2); transition: color 0.16s;
}
.bnav-tab.on { color: var(--text); }
.bnav-tab svg { width: 20px; height: 20px; stroke-width: 1.5; }

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
  const summaries = weekEvents.map((evs, di) => ({
    di, ...getDaySummary(evs || [], rangeStart, rangeEnd)
  }));
  const best = summaries.filter(d => d.freeH  >= 4);
  const good = summaries.filter(d => d.freeH  >= 1 && d.freeH < 4);
  const ok   = summaries.filter(d => d.replyH >= 2 && d.freeH === 0);
  const busy = summaries.filter(d => d.busyH  >= 6 && d.freeH === 0 && d.replyH === 0);
  return { best, good, ok, busy };
}

// ─── WeekView — horizontal bar summary ────────────────────────────
function WeekGrid({ weekEvents, rangeStart = 8, rangeEnd = 22, onDayClick }) {
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {WEEK_DAYS.map((day, di) => {
        const sum     = getDaySummary(weekEvents[di] || [], rangeStart, rangeEnd);
        const isToday = di === todayIdx;
        const span    = rangeEnd - rangeStart;
        return (
          <div key={di} onClick={() => onDayClick && onDayClick(di)}
            style={{
              display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
              borderRadius:10, cursor: onDayClick ? "pointer" : "default",
              border:`1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              background: isToday ? "rgba(124,111,98,0.06)" : "var(--surface)",
              transition:"border-color 0.15s",
            }}>
            <div style={{ width:28, flexShrink:0,
              fontFamily:"var(--font-b)", fontSize:"0.78rem",
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
            <div style={{ fontSize:"0.72rem", color:"var(--muted)", minWidth:64,
              textAlign:"right", fontFamily:"var(--font-b)" }}>
              {sum.label}
            </div>
            {onDayClick && <span style={{ color:"var(--muted2)", fontSize:"0.8rem" }}>›</span>}
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
  const nowBlock = blocks.find(b => nowHour >= b.start && nowHour < b.end);
  const nowStatus = nowBlock?.status ?? "offline";
  const s = STATUS[nowStatus];

  // Next upcoming event
  const sorted    = [...todayEvs].sort((a,b) => new Date(a.startTime)-new Date(b.startTime));
  const nextEv    = sorted.find(ev => new Date(ev.startTime).getHours() > nowHour);
  const currentEv = sorted.find(ev => {
    const sh = new Date(ev.startTime).getHours();
    const eh = new Date(ev.endTime).getHours();
    return nowHour >= sh && nowHour < eh;
  });

  return (
    <div className="page" style={{ paddingTop:26 }}>
      {/* Date header */}
      <div>
        <div style={{ fontFamily:"var(--font-d)", fontStyle:"italic", fontSize:"1.5rem", letterSpacing:"-0.01em" }}>
          今天
        </div>
        <div style={{ fontSize:"0.82rem", color:"var(--muted)", marginTop:2 }}>
          {fmtDateLabel()}
        </div>
      </div>

      {/* Status card — hero */}
      <div className="card">
        <div className="card-label">現在</div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Pip status={nowStatus} size="md" />
          <div>
            <div style={{ fontFamily:"var(--font-b)", fontWeight:500, fontSize:"1.4rem", letterSpacing:"-0.01em", color:s.color }}>
              {s.label}
            </div>
            {nowBlock && nowStatus !== "offline" && (
              <div style={{ fontSize:"0.75rem", color:"var(--muted)", marginTop:2 }}>
                到 {fmt(nowBlock.end)} 為止
                {currentEv && ` · ${currentEv.title}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mini timeline */}
      <div className="card" style={{ padding:"14px 18px" }}>
        <TimelineBar blocks={blocks} />
      </div>

      {/* Next event hint */}
      {nextEv && (
        <div className="card" style={{ padding:"12px 18px" }}>
          <div className="card-label" style={{ marginBottom:6 }}>接下來</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <Pip status={nextEv.status} size="sm" />
            <span style={{ fontSize:"0.9rem", fontWeight:500 }}>{nextEv.title}</span>
            <span style={{ fontSize:"0.76rem", color:"var(--muted)", marginLeft:"auto" }}>
              {fmtTime(nextEv.startTime)}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="btn-row">
        <button className="btn btn-p" onClick={() => setTab("行程")}>
          📋 管理行程
        </button>
        <button className="btn btn-g" onClick={() => setShareOpen(true)}>
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
    <div className='dv-container' ref={containerRef}>
      <div className='dv-wrap' style={{ height: totalH }}>
        <div className='dv-time-col' style={{ height: totalH }}>
          {hours.map((h, i) => (
            <div key={i} className='dv-hour-lbl' style={{ top: i * PX }}>
              {String(h).padStart(2,'0')}
            </div>
          ))}
        </div>
        <div className='dv-col' ref={colRef} style={{ height: totalH }}>
          {hou... （38 KB 剩餘）
