/**
 * DayEvent.jsx — CanWe 日視圖事件卡片
 *
 * 職責：
 *   - 渲染單一事件的視覺卡片
 *   - 提供 drag（整體移動）與 resize（上下邊緣）的 touch/mouse handle
 *   - 雙擊觸發編輯
 *
 * 不負責：
 *   - Drag 計算邏輯（委託 startDrag from useDayDrag）
 *   - 事件資料存取
 *   - 時間軸背景
 *
 * Props:
 *   ev          object     CanWe Event
 *   top         number     CSS top px
 *   height      number     CSS height px
 *   status      object     STATUS[ev.status]（{ color, bg, label }）
 *   startM      number     start minutes（for display）
 *   endM        number     end minutes（for display）
 *   minsToTimeStr (m) => string
 *   startDrag   (e, type, ev) => void   from useDayDrag
 *   onEdit      (ev) => void
 */

export function DayEvent({
  ev,
  top,
  height,
  status,
  startM,
  endM,
  minsToTimeStr,
  startDrag,
  onEdit,
}) {
  return (
    <div
      className="dv-event"
      style={{ top, height, background: status.bg, borderColor: status.color }}
      onMouseDown={e => startDrag(e, "move", ev)}
      onTouchStart={e => startDrag(e, "move", ev)}
      onDoubleClick={e => { e.stopPropagation(); onEdit(ev); }}
    >
      {/* Top resize handle */}
      <div
        className="dv-resize top"
        onMouseDown={e => startDrag(e, "top", ev)}
        onTouchStart={e => startDrag(e, "top", ev)}
      />

      {/* Event title */}
      <div className="dv-event-title" style={{ color: status.color }}>
        {ev.title}
      </div>

      {/* Time range — only shown if tall enough */}
      {height > 36 && (
        <div className="dv-event-time">
          {minsToTimeStr(startM)} – {minsToTimeStr(endM)}
        </div>
      )}

      {/* Bottom resize handle */}
      <div
        className="dv-resize bottom"
        onMouseDown={e => startDrag(e, "bottom", ev)}
        onTouchStart={e => startDrag(e, "bottom", ev)}
      />
    </div>
  );
}

export default DayEvent;
