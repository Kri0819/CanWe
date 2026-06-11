import { useState, useEffect, useRef } from "react";

// ─── Shared constants (injected by App at runtime in single-file build) ───────
// In multi-file project these are imported from shared/constants.js

/**
 * ShareSheet
 * Bottom sheet for sharing availability.
 * Props:
 *   events    Event[]
 *   onClose   () => void
 *   toast     (msg: string) => void
 *   mode      "today" | "week"   (default "today")
 *
 * Receives raw events and builds display internally via buildBlocks().
 * No data fetching. No state persistence.
 */

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
          <div className="sh-sheet-title">{isWeek ? "分享這週行程" : "分享今日行程"}</div>
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
            /* Week grid preview */
            <div style={{ overflowX:"auto" }}>
              <WeekGrid weekEvents={weekEvents} rangeStart={8} rangeEnd={22} />
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

export default ShareSheet;
