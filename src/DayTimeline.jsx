/**
 * DayTimeline.jsx — CanWe 時間軸背景
 *
 * 職責：
 *   - 渲染小時格線（實線）與半小時格線（虛線）
 *   - 渲染小時標籤（左側）
 *   - 渲染「現在」紅線與圓點
 *
 * 不負責：
 *   - 事件卡片渲染（由 DayEvent.jsx 負責）
 *   - Drag / Resize 邏輯（由 useDayDrag.js 負責）
 *   - 資料取得
 *
 * Props:
 *   hours       number[]   可見的時鐘小時陣列（可跨日，e.g. [22,23,0,1,2]）
 *   totalHrs    number     總顯示小時數
 *   totalH      number     總高度 px
 *   PX          number     pixels per hour
 *   nowY        number     現在線 Y 位置（-1 表示不在可見範圍）
 */

export function DayTimeline({ hours, totalHrs, totalH, PX, nowY }) {
  return (
    <>
      {/* Hour labels — left column */}
      <div className="dv-time-col" style={{ height: totalH }}>
        {hours.map((h, i) => (
          <div key={i} className="dv-hour-lbl" style={{ top: i * PX }}>
            {String(h).padStart(2, "0")}
          </div>
        ))}
      </div>

      {/* Grid lines — inside dv-col */}
      {hours.map((h, i) => (
        <div key={i}>
          <div className="dv-gridline" style={{ top: i * PX }} />
          {i < totalHrs && (
            <div className="dv-gridline half" style={{ top: i * PX + PX / 2 }} />
          )}
        </div>
      ))}

      {/* Now indicator */}
      {nowY >= 0 && (
        <div className="dv-now-line" style={{ top: nowY }}>
          <div className="dv-now-dot" />
        </div>
      )}
    </>
  );
}

export default DayTimeline;
