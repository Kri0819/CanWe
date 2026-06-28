/**
 * DayView.jsx — CanWe 日視圖（組合元件）
 *
 * 組合：
 *   DayTimeline  時間軸格線與標籤
 *   DayEvent     事件卡片
 *   useDayDrag   Drag / Resize hook
 *
 * 職責：
 *   - 計算 rangeHours、toY、hourToOffset
 *   - 管理 containerRef scroll-to-now
 *   - 過濾可見事件並計算 top/height
 *   - 組合子元件
 *
 * Props:
 *   events       object[]
 *   setEvents    (updater) => void
 *   onEdit       (ev) => void
 *   rangeStart   number  (default 8)
 *   rangeEnd     number  (default 22)
 */

import { useRef, useEffect } from "react";

export function DayView({ events, setEvents, onEdit, rangeStart = 8, rangeEnd = 22 }) {
  const containerRef = useRef(null);
  const dragRef      = useRef(null);

  // These come from module scope in single-file build
  // In multi-file: import from shared/constants + shared/helpers
  const PX       = PX_PER_HR;
  const totalHrs = rangeHours(rangeStart, rangeEnd);
  const totalH   = totalHrs * PX;

  const toY = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    let offset = h - rangeStart;
    if (offset < 0) offset += 24;
    return (offset + (mins % 60) / 60) * PX;
  };

  const nowH    = new Date().getHours();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const nowOff  = hourToOffset(nowH, rangeStart, totalHrs);
  const nowY    = nowOff !== null ? toY(nowMins) : -1;
  const hours   = Array.from({ length: totalHrs + 1 }, (_, i) => (rangeStart + i) % 24);

  useEffect(() => {
    if (containerRef.current && nowY > 0) {
      containerRef.current.scrollTop = Math.max(0, nowY - 80);
    }
  }, [rangeStart]);

  // ── useDayDrag logic (inlined for single-file build) ──────────────
  // In multi-file: const { startDrag } = useDayDrag({ setEvents, PX_PER_HR, SNAP_MINS, minsToISO, isoToMins })
  const startDrag = (e, type, ev) => {
    e.preventDefault(); e.stopPropagation();
    const startY    = e.touches ? e.touches[0].clientY : e.clientY;
    const origStart = isoToMins(ev.startTime);
    const origEnd   = isoToMins(ev.endTime);
    dragRef.current = { type, evId: ev.id, startY, origStart, origEnd };

    const onMove = (me) => {
      if (!dragRef.current) return;
      const clientY = me.touches ? me.touches[0].clientY : me.clientY;
      const dy      = clientY - dragRef.current.startY;
      const dMins   = Math.round((dy / PX) * 60 / SNAP_MINS) * SNAP_MINS;
      const { type, evId, origStart, origEnd } = dragRef.current;
      const duration = (origEnd - origStart + 1440) % 1440;
      setEvents(prev => prev.map(event => {
        if (event.id !== evId) return event;
        let ns = origStart, ne = origEnd;
        if (type === "move")   { ns = (origStart + dMins + 1440) % 1440; ne = (ns + duration) % 1440; }
        else if (type === "top")    { ns = (origStart + dMins + 1440) % 1440; }
        else if (type === "bottom") { ne = (origEnd   + dMins + 1440) % 1440; }
        return { ...event, startTime: minsToISO(ns), endTime: minsToISO(ne) };
      }));
    };

    const onEnd = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onEnd);
    };
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup",   onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onEnd);
  };

  return (
    <div className="dv-container" ref={containerRef}>
      <div className="dv-wrap" style={{ height: totalH }}>
        {/* DayTimeline: labels */}
        <div className="dv-time-col" style={{ height: totalH }}>
          {hours.map((h, i) => (
            <div key={i} className="dv-hour-lbl" style={{ top: i * PX }}>
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>

        {/* dv-col: gridlines + now + DayEvent cards */}
        <div className="dv-col" style={{ height: totalH }}>
          {/* DayTimeline: gridlines */}
          {hours.map((h, i) => (
            <div key={i}>
              <div className="dv-gridline" style={{ top: i * PX }} />
              {i < totalHrs && <div className="dv-gridline half" style={{ top: i * PX + PX / 2 }} />}
            </div>
          ))}

          {/* DayTimeline: now indicator */}
          {nowY >= 0 && (
            <div className="dv-now-line" style={{ top: nowY }}>
              <div className="dv-now-dot" />
            </div>
          )}

          {/* DayEvent cards */}
          {events.map(ev => {
            const startM   = isoToMins(ev.startTime);
            const startH   = new Date(ev.startTime).getHours();
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
                onMouseDown={e => startDrag(e, "move", ev)}
                onTouchStart={e => startDrag(e, "move", ev)}
                onDoubleClick={e => { e.stopPropagation(); onEdit(ev); }}>
                <div className="dv-resize top"
                  onMouseDown={e => startDrag(e, "top", ev)}
                  onTouchStart={e => startDrag(e, "top", ev)} />
                <div className="dv-event-title" style={{ color: s.color }}>{ev.title}</div>
                {height > 36 && (
                  <div className="dv-event-time">{minsToTimeStr(startM)} – {minsToTimeStr(endM)}</div>
                )}
                <div className="dv-resize bottom"
                  onMouseDown={e => startDrag(e, "bottom", ev)}
                  onTouchStart={e => startDrag(e, "bottom", ev)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DayView;
