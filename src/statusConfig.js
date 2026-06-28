/**
 * statusConfig.js — CanWe 狀態設定檔
 *
 * 集中管理：
 *   STATUS        各狀態的顏色、標籤、背景、emoji
 *   STATUS_KEYS   狀態排列順序
 *   PRIORITY      buildBlocks 計算優先權用
 *   guessStatus() 關鍵字推薦狀態
 *
 * 所有頁面從這裡 import，不得在其他地方重複定義。
 */

export const STATUS = {
  busy:    { color: "#C98D86", label: "忙碌",       bg: "#C98D8614", barColor: "#C98D86", emoji: "🔴" },
  urgent:  { color: "#D6B183", label: "急事可聯繫",  bg: "#D6B18314", barColor: "#D6B183", emoji: "🟠" },
  reply:   { color: "#C8BE97", label: "可回訊息",   bg: "#C8BE9714", barColor: "#C8BE97", emoji: "🟡" },
  free:    { color: "#8FA89D", label: "空閒",       bg: "#8FA89D14", barColor: "#8FA89D", emoji: "🟢" },
  offline: { color: "#B5AEA7", label: "休息中",     bg: "#B5AEA714", barColor: "#B5AEA7", emoji: "🌙" },
};

export const STATUS_KEYS = ["busy", "urgent", "reply", "free", "offline"];

/** Used by buildBlocks to resolve overlapping events */
export const PRIORITY = { busy: 5, urgent: 4, reply: 3, free: 2, offline: 1 };

/**
 * STATUS_HINTS — 每個狀態的說明文字（UI 顯示用）
 * 目前保留為空字串，可由使用者在「狀態管理」設定頁自訂。
 */
export const STATUS_HINTS = {
  busy:    "",
  urgent:  "",
  reply:   "",
  free:    "",
  offline: "",
};

/** Default keyword → status rules (used before user customises in Settings) */
const DEFAULT_RULES = [
  { keyword: "訪視",       status: "busy"  },
  { keyword: "開會",       status: "busy"  },
  { keyword: "會議",       status: "busy"  },
  { keyword: "Meeting",    status: "busy"  },
  { keyword: "看診",       status: "busy"  },
  { keyword: "寫個案紀錄", status: "reply" },
  { keyword: "自由時間",   status: "free"  },
  { keyword: "Free",       status: "free"  },
];

/**
 * Guess status from event title using keyword rules.
 * @param {string} title
 * @param {Array<{keyword:string, status:string}>} [rules]  custom rules (from Settings)
 * @returns {string} status key
 */
export function guessStatus(title, rules = DEFAULT_RULES) {
  for (const rule of rules) {
    if (title.includes(rule.keyword)) return rule.status;
  }
  return "busy"; // conservative default
}
