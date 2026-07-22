/**
 * storageAdapter.js
 * CanWe — 最底層的本地儲存介面
 *
 * 職責：
 *   - 優先使用 window.storage（Claude artifact persistent storage）
 *   - window.storage 不存在時 fallback 到 localStorage
 *   - 提供統一的 getItem / setItem / removeItem
 *   - 所有操作都是 async，並有完整錯誤處理
 *
 * 不負責：
 *   - 資料結構、schema、版本轉換（交給 canweRepository.js）
 *   - 任何業務邏輯
 *
 * React 元件不得直接 import 這個檔案。
 * 只有 canweRepository.js 可以呼叫這裡的函式。
 */

// ─── Backend detection ─────────────────────────────────────────────
function hasWindowStorage() {
  try {
    return typeof window !== "undefined"
      && window.storage
      && typeof window.storage.get === "function"
      && typeof window.storage.set === "function";
  } catch (_) {
    return false;
  }
}

function hasLocalStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch (_) {
    return false;
  }
}

// ─── window.storage backend ────────────────────────────────────────
async function wsGetItem(key) {
  try {
    const result = await window.storage.get(key);
    return result?.value ?? null;
  } catch (_) {
    return null; // key not found or backend error — treat as "no data"
  }
}

async function wsSetItem(key, value) {
  try {
    const result = await window.storage.set(key, value);
    return !!result;
  } catch (_) {
    return false;
  }
}

async function wsRemoveItem(key) {
  try {
    await window.storage.delete(key);
    return true;
  } catch (_) {
    return false;
  }
}

// ─── localStorage backend ──────────────────────────────────────────
async function lsGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

async function lsSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false; // e.g. quota exceeded, private mode restrictions
  }
}

async function lsRemoveItem(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Read a raw string value by key.
 * Returns null if the key doesn't exist or on any error.
 * Never throws.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getItem(key) {
  try {
    if (hasWindowStorage()) {
      const v = await wsGetItem(key);
      if (v !== null) return v;
      // Fall through to localStorage in case data was written there
      // by an older version of the app, or window.storage is flaky.
    }
    if (hasLocalStorage()) {
      return await lsGetItem(key);
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Write a raw string value by key.
 * Returns true if at least one backend succeeded.
 * Never throws.
 * @param {string} key
 * @param {string} value
 * @returns {Promise<boolean>}
 */
export async function setItem(key, value) {
  let ok = false;
  try {
    if (hasWindowStorage()) {
      ok = (await wsSetItem(key, value)) || ok;
    }
  } catch (_) {}
  try {
    if (hasLocalStorage()) {
      ok = (await lsSetItem(key, value)) || ok;
    }
  } catch (_) {}
  return ok;
}

/**
 * Remove a key from storage.
 * Never throws.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function removeItem(key) {
  let ok = false;
  try {
    if (hasWindowStorage()) {
      ok = (await wsRemoveItem(key)) || ok;
    }
  } catch (_) {}
  try {
    if (hasLocalStorage()) {
      ok = (await lsRemoveItem(key)) || ok;
    }
  } catch (_) {}
  return ok;
}

export const storageAdapter = { getItem, setItem, removeItem };
export default storageAdapter;
