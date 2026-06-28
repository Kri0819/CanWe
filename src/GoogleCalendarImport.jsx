/**
 * GoogleCalendarImport.jsx
 * CanWe — Google Calendar 匯入 UI 元件
 *
 * 職責：
 *   - 顯示連結/讀取/預覽/已匯入 四個狀態的 UI
 *   - 讓使用者在匯入前調整每個事件的狀態
 *   - 確認後呼叫 onImport(events[]) 回傳給父層
 *
 * 不負責：
 *   - OAuth 邏輯（交給 GoogleCalendarService）
 *   - Event / Status 資料管理（交給 App）
 *   - 任何 Google API 呼叫
 *
 * Props：
 *   existingEvents  object[]   目前 CanWe 的事件（用於 dedup）
 *   rules           object[]   關鍵字規則（傳給 Service 推薦狀態）
 *   onImport        (events[]) => void   確認匯入後回呼
 *   onBack          () => void
 *   toast           (msg:string) => void
 *   STATUS          object     狀態定義（從 App 傳入，不直接 import）
 *   STATUS_KEYS     string[]
 *   Pip             Component  狀態圓點元件
 *   fmtTime         Function   時間格式化
 *   SettingsBack    Component  返回按鈕
 *   GoogleCalendarService  object  服務層（由 App 注入）
 */

import { useState } from "react";

export function GoogleCalendarImport({
  existingEvents,
  rules,
  onImport,
  onBack,
  toast,
  // Injected from App (avoid circular import in single-file build)
  STATUS,
  STATUS_KEYS,
  Pip,
  fmtTime,
  SettingsBack,
  GoogleCalendarService,
}) {
  const [gcalState, setGcalState] = useState("idle");
  // idle | connecting | preview | imported
  const [preview, setPreview]     = useState([]);

  const connectGoogle = async () => {
    setGcalState("connecting");
    try {
      const proposed = await GoogleCalendarService.connect(existingEvents, rules);
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
    onImport(preview);           // ← 回傳給 App，App 負責 setEvents
    setGcalState("imported");
    toast(`已匯入 ${preview.length} 個事件 ✓`);
  };

  const disconnect = () => {
    GoogleCalendarService.disconnect();
    setGcalState("idle");
    setPreview([]);
  };

  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <SettingsBack onBack={onBack} title="Google Calendar 匯入" />

      {/* 同步策略說明 */}
      <div className="card" style={{ marginBottom: 12 }}>
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

      {/* 連線區塊 */}
      <div className="card">

        {/* idle: 連結按鈕 */}
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

        {/* connecting: spinner */}
        {gcalState === "connecting" && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 0", color:"var(--muted)", fontSize:"0.86rem" }}>
            <div className="spinner" /> 讀取行事曆事件中…
          </div>
        )}

        {/* preview: 事件列表 + 狀態調整 */}
        {gcalState === "preview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:"0.8rem", color:"var(--muted)", lineHeight:1.6 }}>
              找到 {preview.length} 個事件，匯入前可調整狀態：
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {preview.map(ev => {
                const s = STATUS[ev.status];
                return (
                  <div key={ev.gcalId} style={{
                    border:`1px solid ${s.color}28`, borderRadius:10,
                    background:s.bg, padding:"10px 12px",
                    display:"flex", flexDirection:"column", gap:7,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:"0.88rem", fontWeight:500 }}>{ev.title}</div>
                        <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:1, fontVariantNumeric:"tabular-nums" }}>
                          {fmtTime(ev.startTime)} – {fmtTime(ev.endTime)}
                        </div>
                      </div>
                      <Pip status={ev.status} size="sm" />
                    </div>
                    {/* Inline status picker */}
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {STATUS_KEYS.map(k => {
                        const ks = STATUS[k]; const sel = ev.status === k;
                        return (
                          <button key={k}
                            onClick={() => handleAdjustStatus(ev.gcalId, k)}
                            style={{
                              border:`1px solid ${sel ? ks.color : "var(--border2)"}`,
                              background:sel ? ks.bg : "var(--surface)",
                              color:sel ? ks.color : "var(--muted)",
                              borderRadius:7, padding:"3px 9px",
                              fontSize:"0.72rem", fontFamily:"var(--font-b)",
                              cursor:"pointer", fontWeight:sel?500:400,
                              transition:"all 0.14s",
                            }}>
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

        {/* imported: 已連結狀態 */}
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
            <button className="btn-outline" style={{ alignSelf:"flex-start" }} onClick={disconnect}>
              取消連結
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoogleCalendarImport;
