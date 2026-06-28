/**
 * useDayDrag.js — CanWe DayView Drag & Resize Hook
 *
 * 職責：
 *   - 處理事件的 move / top-resize / bottom-resize
 *   - 跨日時間計算（mod 1440）
 *   - 15 分鐘 snap
 *
 * 不負責：
 *   - 任何 UI 渲染
 *   - 事件資料來源
 *   - 時間軸顯示
 *
 * @param {object} options
 *   setEvents   (updater) => void
 *   PX_PER_HR   number   pixels per hour
 *   SNAP_MINS   number   snap resolution in minutes
 *   minsToISO   (mins:number) => string
 *   isoToMins   (iso:string) => number
 */

import { useRef } from "react";

export function useDayDrag({ setEvents, PX_PER_HR, SNAP_MINS, minsToISO, isoToMins }) {
  const dragRef = useRef(null);

  /**
   * Start a drag interaction.
   * @param {Event}  e      mouse or touch event
   * @param {"move"|"top"|"bottom"} type
   * @param {object} ev     CanWe event object
   */
  const startDrag = (e, type, ev) => {
    e.preventDefault();
    e.stopPropagation();

    const startY    = e.touches ? e.touches[0].clientY : e.clientY;
    const origStart = isoToMins(ev.startTime);
    const origEnd   = isoToMins(ev.endTime);

    dragRef.current = { type, evId: ev.id, startY, origStart, origEnd };

    const onMove = (me) => {
      if (!dragRef.current) return;

      const clientY = me.touches ? me.touches[0].clientY : me.clientY;
      const dy      = clientY - dragRef.current.startY;

      // Convert pixel delta to snapped minute delta
      const dMins = Math.round((dy / PX_PER_HR) * 60 / SNAP_MINS) * SNAP_MINS;

      const { type, evId, origStart, origEnd } = dragRef.current;
      const duration = (origEnd - origStart + 1440) % 1440;

      setEvents(prev => prev.map(event => {
        if (event.id !== evId) return event;

        let ns = origStart;
        let ne = origEnd;

        if (type === "move") {
          ns = (origStart + dMins + 1440) % 1440;
          ne = (ns + duration) % 1440;
        } else if (type === "top") {
          ns = (origStart + dMins + 1440) % 1440;
        } else if (type === "bottom") {
          ne = (origEnd + dMins + 1440) % 1440;
        }

        return {
          ...event,
          startTime: minsToISO(ns),
          endTime:   minsToISO(ne),
        };
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

  return { startDrag };
}
