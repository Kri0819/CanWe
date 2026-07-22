/**
 * canweRepository.js
 * CanWe — 所有資料存取的唯一入口
 *
 * 職責：
 *   - 定義統一資料結構（schemaVersion, updatedAt, data{...}）
 *   - 讀取／寫入 events, rules, recurringSchedules, weekStart,
 *     displayRange, statusSettings, onboarded
 *   - 相容舊版分散的 key（canwe:displayRange, canwe:onboarded）
 *   - 未來替換成 Supabase 時，頁面元件完全不需要改動
 *
 * 不負責：
 *   - 實際儲存機制（交給 storageAdapter.js）
 *   - UI、React state
 *
 * 頁面元件（HomePage / EventsPage / SettingsPage / DayView / WeekView）
 * 只能呼叫這個檔案的函式，不得直接接觸 storageAdapter 或
 * window.storage / localStorage。
 *
 * Future:
 * guest user -> local storage adapter (現在，本檔案內部使用)
 * authenticated user -> Supabase adapter（未來替換 storageAdapter 的實作）
 * after login -> merge or migrate guest data to user account（這次不實作）
 */

import { getItem, setItem, removeItem } from "./storageAdapter.js";

// ─── Keys ───────────────────────────────────────────────────────────
const APP_DATA_KEY = "canwe:appData";
const SCHEMA_VERSION = 1;

// Legacy keys from earlier versions — read once for migration, then
// consolidated into APP_DATA_KEY. Never written to again after migration.
const LEGACY_RANGE_KEY = "canwe:displayRange";
const LEGACY_ONBOARD_KEY = "canwe:onboarded";

// ─── Default values ─────────────────────────────────────────────────
// These are ONLY used when there is truly no saved data at all
// (first-ever launch). They must never overwrite an existing empty
// array the user intentionally has (e.g. after deleting all events).
const DEFAULTS = {
  events: null,               // null = "not yet decided, caller should seed"; [] = "user has no events"
  rules: null,
  recurringSchedules: [],
  weekStart: 0,
  displayRange: { start: 8, end: 22 },
  statusSettings: {},
  onboarded: false,
};

// ─── Internal helpers ───────────────────────────────────────────────

function safeParse(json, fallback) {
  if (json == null) return fallback;
  try {
    return JSON.parse(json);
  } catch (_) {
    return fallback;
  }
}

function safeStringify(value, fallback = "null") {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return fallback;
  }
}

/**
 * Build a fresh, empty envelope (used only when absolutely nothing exists yet).
 */
function emptyEnvelope() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    data: {
      events: null,           // signals "no saved data — caller may seed demo events"
      rules: null,            // signals "no saved data — caller may seed default rules"
      recurringSchedules: [],
      weekStart: 0,
      displayRange: { start: 8, end: 22 },
      statusSettings: {},
      onboarded: false,
    },
  };
}

/**
 * Attempt to migrate legacy scattered keys (canwe:displayRange, canwe:onboarded)
 * into the new unified envelope. Only runs once — if APP_DATA_KEY already
 * exists, this is skipped entirely.
 * @returns {Promise<object|null>} envelope built from legacy data, or null if no legacy data found
 */
async function migrateLegacyData() {
  const [legacyRangeRaw, legacyOnboardRaw] = await Promise.all([
    getItem(LEGACY_RANGE_KEY),
    getItem(LEGACY_ONBOARD_KEY),
  ]);

  const hadLegacyRange = legacyRangeRaw != null;
  const hadLegacyOnboard = legacyOnboardRaw != null;

  if (!hadLegacyRange && !hadLegacyOnboard) {
    return null; // nothing to migrate
  }

  const envelope = emptyEnvelope();

  if (hadLegacyRange) {
    const parsed = safeParse(legacyRangeRaw, null);
    if (parsed && typeof parsed.start === "number" && typeof parsed.end === "number") {
      envelope.data.displayRange = parsed;
    }
  }

  if (hadLegacyOnboard) {
    // Legacy format stored "1" as a plain string for "true"
    envelope.data.onboarded = legacyOnboardRaw === "1" || legacyOnboardRaw === "true";
  }

  // Legacy installs always had SEED_EVENTS-equivalent behaviour and default
  // rules, so mark events/rules as "not yet decided" (null) rather than [],
  // letting the caller seed demo data exactly like a first-time user would
  // have seen — but WITHOUT re-triggering onboarding, since we already
  // migrated their onboarded flag above.
  envelope.data.events = null;
  envelope.data.rules = null;

  return envelope;
}

/**
 * Persist the given envelope wholesale.
 * @param {object} envelope
 */
async function writeEnvelope(envelope) {
  envelope.updatedAt = new Date().toISOString();
  await setItem(APP_DATA_KEY, safeStringify(envelope));
}

/**
 * Read the current envelope, or null if nothing has ever been saved
 * (including legacy keys).
 * @returns {Promise<object|null>}
 */
async function readEnvelope() {
  const raw = await getItem(APP_DATA_KEY);
  if (raw != null) {
    const parsed = safeParse(raw, null);
    if (parsed && parsed.data) return parsed;
    // Corrupted JSON — treat as "no data" rather than crashing.
    return null;
  }

  // No unified key yet — attempt legacy migration exactly once.
  const migrated = await migrateLegacyData();
  if (migrated) {
    await writeEnvelope(migrated);
    return migrated;
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Load all CanWe data in one call.
 *
 * Distinguishes between:
 *   - "never saved before"      → events/rules come back as null
 *                                  (caller should seed demo data)
 *   - "saved, but events is []" → events comes back as [] (empty array),
 *                                  which must NOT be replaced with seed data
 *
 * @returns {Promise<{
 *   events: Array|null,
 *   rules: Array|null,
 *   recurringSchedules: Array,
 *   weekStart: number,
 *   displayRange: {start:number, end:number},
 *   statusSettings: object,
 *   onboarded: boolean,
 *   isFirstLaunch: boolean
 * }>}
 */
export async function loadCanWeData() {
  const envelope = await readEnvelope();

  if (!envelope) {
    // Truly first launch — nothing saved, no legacy keys either.
    const fresh = emptyEnvelope();
    return { ...fresh.data, isFirstLaunch: true };
  }

  // Merge with defaults for any fields that might be missing from an
  // older/partial envelope (forward compatibility), without touching
  // fields that ARE present (including intentional empty arrays).
  const data = envelope.data || {};
  return {
    events: Object.prototype.hasOwnProperty.call(data, "events") ? data.events : null,
    rules: Object.prototype.hasOwnProperty.call(data, "rules") ? data.rules : null,
    recurringSchedules: Array.isArray(data.recurringSchedules) ? data.recurringSchedules : [],
    weekStart: typeof data.weekStart === "number" ? data.weekStart : 0,
    displayRange: data.displayRange && typeof data.displayRange.start === "number"
      ? data.displayRange
      : { start: 8, end: 22 },
    statusSettings: data.statusSettings && typeof data.statusSettings === "object"
      ? data.statusSettings
      : {},
    onboarded: !!data.onboarded,
    isFirstLaunch: false,
  };
}

/**
 * Generic helper: read current envelope (or create empty one), mutate
 * one field, write back.
 * @param {string} field
 * @param {*} value
 */
async function saveField(field, value) {
  const envelope = (await readEnvelope()) || emptyEnvelope();
  envelope.data[field] = value;
  await writeEnvelope(envelope);
}

/** @param {Array} events */
export async function saveEvents(events) {
  await saveField("events", Array.isArray(events) ? events : []);
}

/** @param {Array} rules */
export async function saveRules(rules) {
  await saveField("rules", Array.isArray(rules) ? rules : []);
}

/** @param {Array} recurringSchedules */
export async function saveRecurringSchedules(recurringSchedules) {
  await saveField("recurringSchedules", Array.isArray(recurringSchedules) ? recurringSchedules : []);
}

/** @param {number} weekStart 0=Mon..6=Sun */
export async function saveWeekStart(weekStart) {
  await saveField("weekStart", typeof weekStart === "number" ? weekStart : 0);
}

/** @param {{start:number, end:number}} displayRange */
export async function saveDisplayRange(displayRange) {
  await saveField("displayRange", displayRange);
}

/**
 * @param {object} statusSettings  Map of status key -> { label, description }
 *   e.g. { busy: { label:"忙碌", description:"" }, ... }
 *   Only label/description may be customised; keys/order/colour are fixed.
 */
export async function saveStatusSettings(statusSettings) {
  await saveField("statusSettings", statusSettings && typeof statusSettings === "object" ? statusSettings : {});
}

/** @param {boolean} onboarded */
export async function saveOnboarded(onboarded) {
  await saveField("onboarded", !!onboarded);
}

/**
 * Wipe all CanWe data (unified key + legacy keys).
 * Not used by this update, but provided for completeness /
 * future "reset app" settings option.
 */
export async function clearCanWeData() {
  await Promise.all([
    removeItem(APP_DATA_KEY),
    removeItem(LEGACY_RANGE_KEY),
    removeItem(LEGACY_ONBOARD_KEY),
  ]);
}

export const canweRepository = {
  loadCanWeData,
  saveEvents,
  saveRules,
  saveRecurringSchedules,
  saveWeekStart,
  saveDisplayRange,
  saveStatusSettings,
  saveOnboarded,
  clearCanWeData,
};
export default canweRepository;
