import { useState, useEffect, useRef } from "react";

// ─── Shared constants (injected by App at runtime in single-file build) ───────
// In multi-file project these are imported from shared/constants.js

/**
 * WeekView (WeekGrid)
 * Pure display — no state modifications.
 * Props:
 *   weekEvents   Array<Event[]>  — 7 arrays, Mon–Sun
 *   rangeStart   number          — first hour to display
 *   rangeEnd     number          — last hour to display
 *   onDayClick   (weekDayIndex: number) => void  — optional
 *
 * Depends on: STATUS, fmt, buildBlocks, buildHourMap (passed via module scope)
 */

// Grid constants
const GRID_START = 0, GRID_END = 24;

const GRID_HOURS = Array.from({ length: GRID_END - GRID_START }, (_,i) => i);
const WEEK_DAYS = ["一","二","三","四","五","六","日"];

function WeekGrid({ weekEvents, rangeStart = GRID_START, rangeEnd = GRID_END, onDayClick }) {
  const todayIdx = (new Date().getDay() + 6) % 7;
  const hourMaps = weekEvents.map(evs => buildHourMap(buildBlocks(evs)));
  const gridHours = Array.from({ length: rangeEnd - rangeStart }, (_, i) => rangeStart + i);
  return (
    <div className="wk-outer">
      <div className="wk-grid" style={{ gridTemplateRows: `26px repeat(${rangeEnd - rangeStart}, 32px)` }}>
        <div className="wk-corner" />
        {WEEK_DAYS.map((day, di) => (
          <div key={di}
            className={`wk-day-hdr ${di===todayIdx?"today":""}`}
            style={ onDayClick ? { cursor:"pointer" } : {} }
            onClick={() => onDayClick && onDayClick(di)}>
            週{day}
          </div>
        ))}
        {gridHours.map((h, hi) => {
          const isLast = hi === gridHours.length - 1;
          return [
            <div key={`l${h}`} className="wk-hour-lbl" style={{ gridRow:hi+2, gridColumn:1 }}>
              {String(h).padStart(2,"0")}
            </div>,
            ...WEEK_DAYS.map((_, di) => {
              const status = hourMaps[di][h] || "offline";
              const prev   = hi > 0 ? (hourMaps[di][gridHours[hi-1]] || "offline") : null;
              const next   = hi < gridHours.length-1 ? (hourMaps[di][gridHours[hi+1]] || "offline") : null;
              const cls = ["wk-cell", status,
                status !== prev ? "block-start" : "",
                status !== next ? "block-end"   : "",
                di === todayIdx ? "today-col"   : "",
                isLast ? "wk-last-row" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={`${di}-${h}`} className={cls}
                  style={{ gridRow:hi+2, gridColumn:di+2 }}
                  onClick={() => onDayClick && onDayClick(di)}
                  title={`週${WEEK_DAYS[di]}\n${fmt(h)}–${fmt(h+1)}\n${STATUS[status].label}`}
                />
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

export { WeekGrid };
export default WeekGrid;
