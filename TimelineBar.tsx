import { useState, useEffect, useRef } from "react";

// ─── Shared constants (injected by App at runtime in single-file build) ───────
// In multi-file project these are imported from shared/constants.js

/**
 * TimelineBar
 * Pure display — no state, no side effects.
 * Props: blocks  Array<{ start:number, end:number, status:string }>
 */

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

export default TimelineBar;
