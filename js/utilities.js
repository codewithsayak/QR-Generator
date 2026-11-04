/* ==========================================================================
   QR Studio — js/utilities.js
   Shared configuration, DOM helpers, validators, toasts and accessible modals.
   Loaded before every other app module.
   ========================================================================== */

/* --------------------------------------------------------------------------
   CONFIGURATION — edit this block to rebrand QR Studio
   --------------------------------------------------------------------------
   Everything visitor-facing that is not hard-coded copy lives here.
   Set the social URLs below to your real profiles. Leave a value as '' to
   render the link as a clearly-labelled "not configured" button instead of
   sending visitors to a broken or invented profile.
   -------------------------------------------------------------------------- */
const QRS_CONFIG = {
  brand: {
    name: 'QR Studio',
    creator: 'Code With Sayak',
    tagline: 'A free QR code creation tool.',
    builtWith: 'Built with HTML, CSS & JavaScript.'
  },

  // Social / contact links. Example: 'https://github.com/your-username'
  social: {
    github: '',
    instagram: '',
    telegram: '',
    contact: ''
  },

  // Storage limits
  limits: {
    savedCodes: 60,          // maximum saved QR codes kept in LocalStorage
    historyItems: 12,        // maximum recent-activity entries
    logoBytes: 2 * 1024 * 1024,   // 2 MB original upload limit
    maxExportPx: 4096,       // hard cap for custom export dimensions
    maxPayloadChars: 2400    // guard rail before the encoder can overflow
  },

  // Fallback path for the QR encoder if js/vendor/qrcode.js is missing
  qrCdnFallback: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
};

/* ============================== DOM HELPERS ============================== */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/** Create an element with attributes, text and children in one call. */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // only used with trusted, generated markup
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  (Array.isArray(children) ? children : [children]).forEach(child => {
    if (child === null || child === undefined || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

/** Safe HTML escaping for user-provided text (used before any innerHTML). */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, wait = 180) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const uid = () => 'qr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** SVG icon markup from the inline sprite. `name` is always a hard-coded id. */
const icon = (name, className = 'icon') => `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const iconNode = (name, className = 'icon') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
};

/* ============================== FORMATTING ============================== */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatRelativeDate(timestamp) {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return 'Unknown date';
  const diff = Date.now() - then;
  const minute = 60000, hour = 3600000, day = 86400000;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)} d ago`;
  return formatDate(then).split(',')[0];
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function truncate(text, length = 60) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return value.length > length ? value.slice(0, length - 1) + '…' : value;
}

function safeFileName(name, fallback = 'qr-studio') {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase();
  return cleaned || fallback;
}

/* ============================== COLOR HELPERS ============================== */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function isValidHex(value) {
  return HEX_RE.test(String(value || '').trim());
}

/** Normalise #abc -> #AABBCC, returns null when invalid. */
function normalizeHex(value) {
  const raw = String(value || '').trim();
  if (!isValidHex(raw)) return null;
  let hex = raw.slice(1);
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return '#' + hex.toUpperCase();
}

function hexToRgb(hex) {
  const normal = normalizeHex(hex) || '#000000';
  const value = parseInt(normal.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors (1 – 21). */
function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/** True when the foreground is lighter than the background (an inverted code). */
function isInverted(fg, bg) {
  return relativeLuminance(fg) > relativeLuminance(bg);
}

/* ============================== VALIDATORS ============================== */
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || '').trim());
}

function digitsOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function isPhone(value) {
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 15;
}

function isLatitude(value) {
  const n = Number(String(value).trim());
  return String(value).trim() !== '' && Number.isFinite(n) && n >= -90 && n <= 90;
}

function isLongitude(value) {
  const n = Number(String(value).trim());
  return String(value).trim() !== '' && Number.isFinite(n) && n >= -180 && n <= 180;
}

/** Accepts example.com or https://example.com and returns a URL or null. */
function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Spaces are legal in pasteable text but not in URLs — encode them instead
  // of rejecting input the user considers valid.
  const cleaned = raw.replace(/\s+/g, '%20');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : 'https://' + cleaned;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!/\./.test(url.hostname) && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch (error) {
    return null;
  }
}

/* ============================== TOASTS ============================== */
let toastSequence = 0;

function toast(message, options = {}) {
  const { type = 'info', title = '', timeout = 4200 } = options;
  const container = $('#toasts');
  if (!container) return;

  const iconName = { success: 'check', error: 'alert', warn: 'alert', info: 'help' }[type] || 'help';
  const node = el('div', { class: `toast toast--${type}`, dataset: { toastId: String(++toastSequence) } }, [
    iconNode(iconName),
    el('div', { class: 'toast__body' }, [
      title ? el('strong', { class: 'toast__title', text: title }) : null,
      el('span', { class: 'toast__text', text: message })
    ])
  ]);

  container.append(node);
  // keep at most 4 toasts on screen
  Array.from(container.children).slice(0, -4).forEach(child => child.remove());

  const remove = () => {
    if (!node.isConnected) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 240);
  };
  node.addEventListener('click', remove);
  if (timeout > 0) setTimeout(remove, timeout);
}

/* ============================== MODALS ============================== */
let modalState = { resolve: null, lastFocused: null, keyHandler: null };

function isModalOpen() {
  const root = $('#modalRoot');
  return Boolean(root && !root.hidden);
}

function closeModal(value = null) {
  const root = $('#modalRoot');
  if (!root || root.hidden) return;
  root.hidden = true;
  document.body.style.removeProperty('overflow');
  if (modalState.keyHandler) document.removeEventListener('keydown', modalState.keyHandler);
  const resolve = modalState.resolve;
  const lastFocused = modalState.lastFocused;
  modalState = { resolve: null, lastFocused: null, keyHandler: null };
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  if (resolve) resolve(value);
}

/**
 * Open the shared modal shell.
 * @returns {Promise<string|null>} resolves with the chosen action value, or null.
 */
function openModal({ title, text = '', body = null, actions = [], onMount = null }) {
  const root = $('#modalRoot');
  if (!root) return Promise.resolve(null);
  if (isModalOpen()) closeModal(null);

  const dialog = $('#modalDialog');
  $('#modalTitle').textContent = title;

  const textNode = $('#modalText');
  textNode.textContent = text;
  textNode.hidden = !text;

  const bodyNode = $('#modalBody');
  bodyNode.replaceChildren();
  if (body) bodyNode.append(body);

  const actionsNode = $('#modalActions');
  actionsNode.replaceChildren();
  actions.forEach(action => {
    const button = el('button', {
      class: `btn ${action.variant ? 'btn--' + action.variant : ''}`.trim(),
      type: 'button',
      text: action.label
    });
    button.addEventListener('click', () => {
      if (action.onClick) action.onClick();
      closeModal(action.value === undefined ? action.label : action.value);
    });
    actionsNode.append(button);
  });

  modalState.lastFocused = document.activeElement;
  modalState.resolve = null;
  document.body.style.overflow = 'hidden';
  root.hidden = false;

  root.querySelectorAll('[data-modal-close]').forEach(node => {
    node.onclick = () => closeModal(null);
  });

  const focusablesSelector = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusables = () => Array.from(dialog.querySelectorAll(focusablesSelector))
    .filter(node => !node.disabled && node.offsetParent !== null);

  modalState.keyHandler = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(null);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', modalState.keyHandler);

  const autoFocus = dialog.querySelector('[data-autofocus]') || focusables()[0] || dialog;
  setTimeout(() => autoFocus.focus(), 30);

  if (typeof onMount === 'function') onMount(dialog);

  return new Promise(resolve => {
    modalState.resolve = resolve;
  });
}

/** Confirmation dialog → true/false. */
function confirmDialog({ title = 'Are you sure?', text = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return openModal({
    title,
    text,
    actions: [
      { label: cancelLabel, value: 'cancel' },
      { label: confirmLabel, value: 'confirm', variant: danger ? 'danger-ghost' : 'primary' }
    ]
  }).then(result => result === 'confirm');
}

/** Text prompt dialog → trimmed string or null. */
function promptDialog({ title, text = '', label = 'Name', value = '', placeholder = '', confirmLabel = 'Save' }) {
  const inputId = 'modalPromptInput';
  const body = el('div', { class: 'field' }, [
    el('label', { class: 'label', for: inputId, text: label }),
    el('input', {
      class: 'input',
      id: inputId,
      type: 'text',
      maxlength: '80',
      value,
      placeholder,
      autocomplete: 'off',
      'data-autofocus': 'true'
    })
  ]);

  let inputEl = null;
  let enterValue = null;

  const onMount = dialog => {
    inputEl = dialog.querySelector('#' + inputId);
    if (!inputEl) return;
    inputEl.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      enterValue = inputEl.value.trim();
      closeModal('enter');
    });
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 40);
  };

  return openModal({
    title,
    text,
    body,
    onMount,
    actions: [
      { label: 'Cancel', value: null },
      { label: confirmLabel, variant: 'primary', value: 'confirm' }
    ]
  }).then(result => {
    if (result === 'enter') return enterValue;
    if (result === 'confirm') return inputEl ? inputEl.value.trim() : '';
    return null;
  });
}

/** Read-only informational modal (used by the fullscreen preview). */
function infoDialog({ title, text = '', node = null, actions = [{ label: 'Close', value: 'close', variant: 'primary' }] }) {
  return openModal({ title, text, body: node, actions });
}

/* ============================== CLIPBOARD / DOWNLOAD ============================== */
async function copyText(text) {
  const value = String(text == null ? '' : text);
  if (!value) throw new Error('Nothing to copy');
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const helper = el('textarea', {
    style: 'position:fixed;top:-1000px;left:-1000px;opacity:0;',
    readonly: true
  });
  helper.value = value;
  document.body.append(helper);
  helper.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } finally { helper.remove(); }
  if (!ok) throw new Error('Copy not supported');
  return true;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename, rel: 'noopener' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Scroll to a section and move keyboard focus to its heading. */
function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const heading = target.querySelector('h1, h2, h3');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    setTimeout(() => heading.focus({ preventScroll: true }), 420);
  }
}

/* ============================== EXPORTS ============================== */
window.QRS_UTIL = {
  $, $$, el, escapeHtml, debounce, clamp, uid, icon, iconNode,
  formatDate, formatRelativeDate, formatBytes, truncate, safeFileName,
  isValidHex, normalizeHex, hexToRgb, relativeLuminance, contrastRatio, isInverted,
  isEmail, isPhone, digitsOnly, isLatitude, isLongitude, normalizeUrl,
  toast, openModal, closeModal, isModalOpen, confirmDialog, promptDialog, infoDialog,
  copyText, downloadBlob, scrollToSection
};
window.QRS_CONFIG = QRS_CONFIG;
