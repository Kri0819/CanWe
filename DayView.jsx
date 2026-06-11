import { useState, useEffect, useRef } from "react";

// ─── Shared constants (injected by App at runtime in single-file build) ───────
// In multi-file project these are imported from shared/constants.js

/**
 * DayView
 * Day timeline with draggable/resizable event blocks.
 * Props:
 *   events       Event[]
 *   setEvents    (updater) => void
 *   onEdit       (event) => void
 *   rangeStart   number  (default 8)
 *   rangeEnd     number  (default 22)
 *
 * No App state. No routing. No calendar sync.
 */

// Timeline constants
const PX_PER_HR = 36;  // pixels per hour in timeline
const SNAP_MINS = 15;  // drag snap resolution

// Helpers
function rangeHours(start, end) {
  return start <= end ? end - start : (24 - start) + end;
}

function hourToOffset(h, rangeStart, totalH) {
  const crossDay = rangeStart > (rangeStart + totalH) % 24; // wraps midnight
  let offset = h - rangeStart;
  if (offset < 0) offset += 24;
  if (offset > totalH) return null; // outside visible range
  return offset;
}

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

// Component
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
          {hours.map((h, i) => (
            <div key={i}>
              <div className='dv-gridline' style={{ top: i * PX }} />
              {i < totalHrs && <div className='dv-gridline half' style={{ top: i * PX + PX / 2 }} />}
            </div>
          ))}
          {nowY >= 0 && (
            <div className='dv-now-line' style={{ top: nowY }}>
              <div className='dv-now-dot' />
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
              <div key={ev.id} className='dv-event'
                style={{ top, height, background: s.bg, borderColor: s.color }}
                onMouseDown={e => startDrag(e, 'move', ev)}
                onTouchStart={e => startDrag(e, 'move', ev)}
                onDoubleClick={e => { e.stopPropagation(); onEdit(ev); }}>
                <div className='dv-resize top'
                  onMouseDown={e => startDrag(e, 'top', ev)}
                  onTouchStart={e => startDrag(e, 'top', ev)} />
                <div className='dv-event-title' style={{ color: s.color }}>{ev.title}</div>
                {height > 36 && (
                  <div className='dv-event-time'>
                    {minsToTimeStr(startM)} – {minsToTimeStr(endM)}
                  </div>
                )}
                <div className='dv-resize bottom'
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

export default DayView;
