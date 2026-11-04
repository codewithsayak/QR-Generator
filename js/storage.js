/* ==========================================================================
   QR Studio — js/storage.js
   All persistence lives here: saved QR codes, recent activity and preferences.
   Every read/write is guarded so a blocked, full or corrupted LocalStorage
   degrades gracefully instead of breaking the studio.
   ========================================================================== */

const QRS_STORAGE = (function () {
  const PREFIX = 'qrstudio.v1.';
  const KEYS = {
    saved: PREFIX + 'saved',
    history: PREFIX + 'history',
    prefs: PREFIX + 'prefs'
  };

  const LIMITS = {
    saved: (window.QRS_CONFIG && QRS_CONFIG.limits.savedCodes) || 60,
    history: (window.QRS_CONFIG && QRS_CONFIG.limits.historyItems) || 12
  };

  /* In-memory fallback used when LocalStorage is unavailable (private mode, blocked cookies). */
  const memory = new Map();
  let available = testAvailability();

  function testAvailability() {
    try {
      const key = PREFIX + '__test';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function rawGet(key) {
    if (!available) return memory.has(key) ? memory.get(key) : null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      available = false;
      return memory.has(key) ? memory.get(key) : null;
    }
  }

  function rawSet(key, value) {
    if (!available) {
      memory.set(key, value);
      return { ok: true, persisted: false };
    }
    try {
      window.localStorage.setItem(key, value);
      return { ok: true, persisted: true };
    } catch (error) {
      const quota = error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
      return {
        ok: false,
        persisted: false,
        error: quota ? 'quota' : 'blocked',
        message: quota
          ? 'Browser storage is full. Delete a saved QR code or export your logos first.'
          : 'This browser blocked local storage, so nothing could be saved.'
      };
    }
  }

  function readJSON(key, fallback) {
    const raw = rawGet(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      // Corrupted entry: drop it rather than crashing the app.
      try {
        if (available) window.localStorage.removeItem(key); else memory.delete(key);
      } catch (ignored) { /* noop */ }
      console.warn('[QR Studio] Removed malformed storage entry:', key);
      return fallback;
    }
  }

  /* --------------------------------------------------------------------
     Sanitisers — only whitelisted, correctly typed fields are ever stored.
     -------------------------------------------------------------------- */
  const DESIGN_DEFAULTS = {
    fg: '#0B1512',
    bg: '#FFFFFF',
    eyeColor: '#0F766E',
    eyeColorEnabled: false,
    ecc: 'M',
    margin: 4,
    moduleStyle: 'square',
    eyeStyle: 'square',
    transparent: false,
    logo: null
  };

  const MODULE_STYLES = ['square', 'rounded', 'dots'];
  const EYE_STYLES = ['square', 'rounded', 'circle', 'leaf'];
  const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

  function sanitizeString(value, max = 400) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function sanitizeLogo(logo) {
    if (!logo || typeof logo !== 'object') return null;
    const dataUrl = typeof logo.dataUrl === 'string' && /^data:image\//.test(logo.dataUrl) ? logo.dataUrl : '';
    if (!dataUrl) return null;
    return {
      dataUrl,
      name: sanitizeString(logo.name, 120),
      size: clampNumber(logo.size, 10, 32, 22),
      padding: clampNumber(logo.padding, 0, 40, 12),
      bg: normalizeHex(logo.bg) || '#FFFFFF',
      round: typeof logo.round === 'boolean' ? logo.round : true
    };
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function sanitizeDesign(design) {
    const source = design && typeof design === 'object' ? design : {};
    const safe = {
      fg: normalizeHex(source.fg) || DESIGN_DEFAULTS.fg,
      bg: normalizeHex(source.bg) || DESIGN_DEFAULTS.bg,
      eyeColor: normalizeHex(source.eyeColor) || DESIGN_DEFAULTS.eyeColor,
      eyeColorEnabled: Boolean(source.eyeColorEnabled),
      ecc: ECC_LEVELS.includes(source.ecc) ? source.ecc : DESIGN_DEFAULTS.ecc,
      margin: Math.round(clampNumber(source.margin, 0, 10, DESIGN_DEFAULTS.margin)),
      moduleStyle: MODULE_STYLES.includes(source.moduleStyle) ? source.moduleStyle : DESIGN_DEFAULTS.moduleStyle,
      eyeStyle: EYE_STYLES.includes(source.eyeStyle) ? source.eyeStyle : DESIGN_DEFAULTS.eyeStyle,
      transparent: Boolean(source.transparent),
      logo: sanitizeLogo(source.logo)
    };
    return safe;
  }

  function sanitizeValues(values) {
    const output = {};
    if (!values || typeof values !== 'object') return output;
    Object.entries(values).forEach(([key, value]) => {
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) return;
      if (typeof value === 'boolean') output[key] = value;
      else if (typeof value === 'string') output[key] = value.slice(0, 2000);
      else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    });
    return output;
  }

  function sanitizeRecord(record, { stripLogo = false } = {}) {
    if (!record || typeof record !== 'object') return null;
    const design = sanitizeDesign(record.design);
    if (stripLogo) design.logo = null;
    const payload = sanitizeString(record.payload, 4000);
    if (!payload) return null;
    return {
      id: sanitizeString(record.id, 60) || 'qr_' + Math.random().toString(36).slice(2, 10),
      name: sanitizeString(record.name, 80),
      type: sanitizeString(record.type, 32) || 'text',
      values: sanitizeValues(record.values),
      design,
      payload,
      label: sanitizeString(record.label, 120),
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
      updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now()
    };
  }

  /* ============================ SAVED CODES ============================ */
  function getSaved() {
    const raw = readJSON(KEYS.saved, []);
    if (!Array.isArray(raw)) return [];
    const cleaned = raw.map(item => sanitizeRecord(item)).filter(Boolean);
    if (cleaned.length !== raw.length) writeSaved(cleaned);
    return cleaned;
  }

  function writeSaved(items) {
    return rawSet(KEYS.saved, JSON.stringify(items));
  }

  function saveCode(record) {
    const safe = sanitizeRecord(record);
    if (!safe) return { ok: false, error: 'invalid', message: 'This QR code could not be saved.' };
    const items = getSaved();
    const existingIndex = items.findIndex(item => item.id === safe.id);
    if (existingIndex >= 0) {
      safe.createdAt = items[existingIndex].createdAt;
      safe.updatedAt = Date.now();
      items[existingIndex] = safe;
    } else {
      if (items.length >= LIMITS.saved) {
        return {
          ok: false,
          error: 'limit',
          message: `You can keep ${LIMITS.saved} saved QR codes. Delete one to make room.`
        };
      }
      items.unshift(safe);
    }
    const result = writeSaved(items);
    return { ...result, data: safe, items: getSaved() };
  }

  function deleteCode(id) {
    const items = getSaved().filter(item => item.id !== id);
    const result = writeSaved(items);
    return { ...result, items };
  }

  function duplicateCode(id) {
    const items = getSaved();
    const original = items.find(item => item.id === id);
    if (!original) return { ok: false, error: 'missing', message: 'That saved QR code no longer exists.' };
    const copy = sanitizeRecord({
      ...original,
      id: 'qr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      name: (original.name || 'Untitled') + ' copy',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    if (items.length >= LIMITS.saved) {
      return { ok: false, error: 'limit', message: `You can keep ${LIMITS.saved} saved QR codes. Delete one to make room.` };
    }
    items.unshift(copy);
    const result = writeSaved(items);
    return { ...result, data: copy, items: getSaved() };
  }

  function clearSaved() {
    const result = writeSaved([]);
    return { ...result, items: [] };
  }

  /* ============================ HISTORY ============================ */
  function getHistory() {
    const raw = readJSON(KEYS.history, []);
    if (!Array.isArray(raw)) return [];
    // History never stores logos: it must stay small even with many entries.
    const cleaned = raw.map(item => sanitizeRecord(item, { stripLogo: true })).filter(Boolean);
    if (cleaned.length !== raw.length) writeHistory(cleaned);
    return cleaned;
  }

  function writeHistory(items) {
    return rawSet(KEYS.history, JSON.stringify(items.slice(0, LIMITS.history)));
  }

  function addHistory(entry) {
    const safe = sanitizeRecord(entry, { stripLogo: true });
    if (!safe) return { ok: false, error: 'invalid' };
    const items = getHistory().filter(item => item.payload !== safe.payload);
    items.unshift(safe);
    const trimmed = items.slice(0, LIMITS.history);
    const result = writeHistory(trimmed);
    return { ...result, items: trimmed };
  }

  function clearHistory() {
    const result = rawSet(KEYS.history, JSON.stringify([]));
    return { ...result, items: [] };
  }

  /* ============================ PREFERENCES ============================ */
  function getPrefs() {
    const raw = readJSON(KEYS.prefs, {});
    if (!raw || typeof raw !== 'object') return {};
    const prefs = {};
    if (raw.theme === 'light' || raw.theme === 'dark') prefs.theme = raw.theme;
    if (typeof raw.livePreview === 'boolean') prefs.livePreview = raw.livePreview;
    if (raw.design) prefs.design = sanitizeDesign(raw.design);
    if (raw.lastType && typeof raw.lastType === 'string') prefs.lastType = raw.lastType.slice(0, 32);
    if (raw.export && typeof raw.export === 'object') {
      prefs.export = {
        format: ['png', 'svg', 'jpeg'].includes(raw.export.format) ? raw.export.format : 'png',
        size: ['512', '1024', '2048', 'custom'].includes(String(raw.export.size)) ? String(raw.export.size) : '1024',
        customW: Math.round(clampNumber(raw.export.customW, 128, 4096, 1200)),
        customH: Math.round(clampNumber(raw.export.customH, 128, 4096, 1200)),
        quality: Math.round(clampNumber(raw.export.quality, 50, 100, 92)),
        includeQuiet: typeof raw.export.includeQuiet === 'boolean' ? raw.export.includeQuiet : true,
        checker: Boolean(raw.export.checker)
      };
    }
    return prefs;
  }

  function setPrefs(patch) {
    const current = getPrefs();
    const next = { ...current, ...patch };
    return rawSet(KEYS.prefs, JSON.stringify(next));
  }

  /* ============================ DIAGNOSTICS ============================ */
  function stats() {
    const saved = getSaved();
    const history = getHistory();
    let bytes = 0;
    try {
      [KEYS.saved, KEYS.history, KEYS.prefs].forEach(key => {
        const value = rawGet(key);
        if (value) bytes += value.length * 2;
      });
    } catch (error) { /* noop */ }
    return {
      available,
      savedCount: saved.length,
      historyCount: history.length,
      approximateBytes: bytes
    };
  }

  return {
    available: () => available,
    getSaved, saveCode, deleteCode, duplicateCode, clearSaved,
    getHistory, addHistory, clearHistory,
    getPrefs, setPrefs, stats,
    limits: LIMITS,
    sanitizeDesign
  };
})();

window.QRS_STORAGE = QRS_STORAGE;
