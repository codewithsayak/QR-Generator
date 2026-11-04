/* ==========================================================================
   QR Studio — js/app.js
   UI controller: state, rendering, validation, preview, downloads, library.
   ========================================================================== */

(function () {
  'use strict';

  const U = window.QRS_UTIL;
  const QR = window.QRS_QR;
  const Store = window.QRS_STORAGE;
  const Exporter = window.QRS_EXPORT;

  const {
    $, $$, el, debounce, clamp, uid, truncate,
    normalizeHex, formatRelativeDate, formatDate, formatBytes, safeFileName,
    toast, confirmDialog, promptDialog, infoDialog, copyText, scrollToSection
  } = U;

  const DEFAULT_DESIGN = {
    fg: '#0B1220',
    bg: '#FFFFFF',
    eyeColor: '#1D4ED8',
    eyeColorEnabled: false,
    ecc: 'M',
    margin: 4,
    moduleStyle: 'square',
    eyeStyle: 'square',
    transparent: false,
    logo: null
  };

  const DEFAULT_EXPORT = {
    format: 'png',
    size: '1024',
    customW: 1200,
    customH: 1200,
    quality: 92,
    includeQuiet: true,
    checker: false
  };

  const PRESETS = [
    { name: 'Midnight', fg: '#0B1220', bg: '#FFFFFF' },
    { name: 'Electric', fg: '#1D4ED8', bg: '#FFFFFF' },
    { name: 'Violet', fg: '#5B21B6', bg: '#F5F3FF' },
    { name: 'Forest', fg: '#065F46', bg: '#ECFDF5' },
    { name: 'Ember', fg: '#9A3412', bg: '#FFF7ED' },
    { name: 'Ink', fg: '#111827', bg: '#E5E7EB' },
    { name: 'Cyan', fg: '#0E7490', bg: '#ECFEFF' },
    { name: 'Invert', fg: '#FFFFFF', bg: '#0B1220' }
  ];

  const FIELD_DEFAULTS = {
    whatsapp: { cc: '91' },
    wifi: { encryption: 'WPA', hidden: false }
  };

  const ECC_LABELS = { L: 'L — Low (~7%)', M: 'M — Medium (~15%)', Q: 'Q — Quartile (~25%)', H: 'H — High (~30%)' };
  const ECC_PERCENT = { L: 7, M: 15, Q: 25, H: 30 };

  const state = {
    type: 'url',
    valuesByType: {},
    design: { ...DEFAULT_DESIGN },
    logoImage: null,
    live: true,
    showErrors: false,
    export: { ...DEFAULT_EXPORT },
    matrix: null,
    payload: '',
    label: '',
    svgMarkup: '',
    errors: {},
    editingId: null,
    saved: [],
    history: [],
    theme: 'dark',
    busy: false
  };

  /* ======================================================================
     BOOT
     ----------------------------------------------------------------------
     Init runs exactly once, whether the script is loaded before the DOM is
     ready (defer/head) or after it has already parsed (end of body).
     ====================================================================== */
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  async function init() {
    const prefs = Store.getPrefs();
    state.theme = prefs.theme || 'dark';
    applyTheme(state.theme);

    if (typeof prefs.livePreview === 'boolean') state.live = prefs.livePreview;
    if (prefs.design) state.design = { ...DEFAULT_DESIGN, ...prefs.design };
    if (prefs.export) state.export = { ...DEFAULT_EXPORT, ...sanitizeExportPrefs(prefs.export) };
    if (prefs.lastType && QR.TYPES_BY_ID[prefs.lastType]) state.type = prefs.lastType;

    $('#year').textContent = String(new Date().getFullYear());
    $('#liveToggle').checked = state.live;

    renderTypeGrid();
    renderPresets();
    renderTemplates();
    renderFields();
    syncDesignControls();
    syncExportControls();
    bindEvents();
    initSocialLinks();
    initAccordion();
    initSavedFilter();
    populateSaved();
    populateHistory();

    const ready = await QR.ensureLibrary();
    if (!ready) {
      setLibraryError();
      return;
    }
    refresh({ validate: false });
    restoreLogo();
    updateStorageNotice();
  }

  function sanitizeExportPrefs(exportPrefs) {
    return {
      format: ['png', 'svg', 'jpeg'].includes(exportPrefs.format) ? exportPrefs.format : 'png',
      size: ['512', '1024', '2048', 'custom'].includes(String(exportPrefs.size)) ? String(exportPrefs.size) : '1024',
      customW: Number(exportPrefs.customW) || 1200,
      customH: Number(exportPrefs.customH) || 1200,
      quality: Number(exportPrefs.quality) || 92,
      includeQuiet: exportPrefs.includeQuiet !== false,
      checker: Boolean(exportPrefs.checker)
    };
  }

  function setLibraryError() {
    const stage = $('#qrStage');
    $('#qrEmptyTitle').textContent = 'QR library unavailable';
    $('#qrEmptyText').textContent = 'The QR encoder could not be loaded. Check your connection, then reload the page.';
    if (stage) stage.classList.add('has-error');
    $('#formNote').textContent = 'QR encoding is unavailable — please reload.';
    $('#formNote').classList.add('is-error');
    $('#downloadBtn').disabled = true;
    $$('#qrForm button[type="submit"]').forEach(button => { button.disabled = true; });
    toast('The QR encoder failed to load. Reload the page to try again.', { type: 'error', title: 'Encoder unavailable', timeout: 8000 });
  }

  function updateStorageNotice() {
    if (!Store.available()) {
      toast('Local storage is blocked in this browser. The studio works, but saving and history are unavailable.', {
        type: 'warn', title: 'Storage blocked', timeout: 8000
      });
    }
  }

  /* ======================================================================
     THEME
     ====================================================================== */
  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    state.theme = next;
    document.documentElement.dataset.theme = next;
    const toggle = $('#themeToggle');
    if (toggle) {
      toggle.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('title', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#14171e' : '#e9edf5');
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    Store.setPrefs({ theme: state.theme });
  }

  /* ======================================================================
     TYPE SELECTOR + FORM
     ====================================================================== */
  function renderTypeGrid() {
    const grid = $('#typeGrid');
    grid.replaceChildren();
    QR.QR_TYPES.forEach(type => {
      const button = el('button', {
        class: 'type-btn',
        type: 'button',
        'aria-pressed': String(type.id === state.type),
        'data-type': type.id,
        title: type.hint
      }, [U.iconNode(type.icon), el('span', { text: type.name })]);
      grid.append(button);
    });
    updateTypeHint();
  }

  function updateTypeHint() {
    const type = QR.TYPES_BY_ID[state.type];
    const hint = $('#typeHint');
    if (type && hint) hint.textContent = type.hint;
  }

  function ensureValues(typeId) {
    if (!state.valuesByType[typeId]) {
      const type = QR.TYPES_BY_ID[typeId];
      const values = {};
      (type ? type.fields : []).forEach(field => {
        values[field.name] = field.type === 'checkbox' ? false : '';
      });
      Object.assign(values, FIELD_DEFAULTS[typeId] || {});
      state.valuesByType[typeId] = values;
    }
    return state.valuesByType[typeId];
  }

  function currentValues() {
    return ensureValues(state.type);
  }

  /** Build the dynamic form for the active QR type. */
  function renderFields() {
    const type = QR.TYPES_BY_ID[state.type];
    const container = $('#dynamicFields');
    container.replaceChildren();
    if (!type) return;

    const values = ensureValues(type.id);
    let row = null;

    type.fields.forEach(field => {
      const wrapper = buildField(field, values[field.name]);
      if (field.half) {
        if (!row || row.childElementCount >= 2) {
          row = el('div', { class: 'field-row' });
          container.append(row);
        }
        row.append(wrapper);
      } else {
        row = null;
        container.append(wrapper);
      }
    });
  }

  function buildField(field, value) {
    const wrapper = el('div', { class: 'field', dataset: { field: field.name } });
    const inputId = `f_${state.type}_${field.name}`;

    if (field.type === 'checkbox') {
      const label = el('label', { class: 'check', for: inputId }, [
        el('input', { type: 'checkbox', id: inputId, name: field.name }),
        el('span', { text: field.label })
      ]);
      wrapper.append(label);
      const input = label.querySelector('input');
      input.checked = Boolean(value);
      input.dataset.fieldName = field.name;
      return wrapper;
    }

    const label = el('label', { class: 'label', for: inputId, text: field.label });
    wrapper.append(label);

    let input;
    if (field.type === 'textarea') {
      input = el('textarea', {
        class: 'textarea', id: inputId, name: field.name,
        placeholder: field.placeholder || '',
        rows: 3
      });
      input.value = value || '';
    } else if (field.type === 'select') {
      input = el('select', { class: 'select', id: inputId, name: field.name });
      (field.options || []).forEach(option => {
        const node = el('option', { value: option.value, text: option.label });
        if ((value || field.options[0].value) === option.value) node.selected = true;
        input.append(node);
      });
    } else {
      input = el('input', {
        class: 'input',
        id: inputId,
        name: field.name,
        type: field.type === 'datetime-local' ? 'datetime-local' : (field.type || 'text'),
        placeholder: field.placeholder || '',
        autocomplete: field.autocomplete || 'off',
        inputmode: field.inputmode || null,
        maxlength: field.maxlength || null,
        'aria-describedby': field.hint ? `${inputId}_hint` : null
      });
      input.value = value == null ? '' : value;
    }

    if (field.required) input.setAttribute('aria-required', 'true');
    wrapper.append(input);

    if (field.hint) {
      wrapper.append(el('small', { class: 'help-text', id: `${inputId}_hint`, text: field.hint }));
    }
    return wrapper;
  }

  function selectType(typeId, options = {}) {
    if (!QR.TYPES_BY_ID[typeId]) return;
    state.type = typeId;
    state.showErrors = false;
    if (options.values) {
      state.valuesByType[typeId] = { ...ensureValues(typeId), ...options.values };
    }
    if (!options.keepEditing) state.editingId = null;

    $$('#typeGrid .type-btn').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.type === typeId));
    });
    updateTypeHint();
    renderFields();
    setFormNote('');
    Store.setPrefs({ lastType: typeId });
    refresh({ validate: false });
  }

  function handleFieldChange(event) {
    const target = event.target;
    const wrapper = target.closest('[data-field]');
    if (!wrapper) return;
    const name = wrapper.dataset.field;
    const values = currentValues();
    values[name] = target.type === 'checkbox' ? target.checked : target.value;
    clearFieldError(name);
    scheduleRefresh();
  }

  function setFieldError(name, message) {
    const wrapper = $('#dynamicFields [data-field="' + name + '"]');
    if (!wrapper) return;
    wrapper.classList.add('has-error');
    if (wrapper.querySelector('.field-error')) return;
    wrapper.append(el('small', { class: 'field-error', text: message }));
    const input = wrapper.querySelector('input, textarea, select');
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(name) {
    const wrapper = $('#dynamicFields [data-field="' + name + '"]');
    if (!wrapper) return;
    wrapper.classList.remove('has-error');
    const error = wrapper.querySelector('.field-error');
    if (error) error.remove();
    const input = wrapper.querySelector('input, textarea, select');
    if (input) input.removeAttribute('aria-invalid');
  }

  function clearAllFieldErrors() {
    $$('#dynamicFields .field').forEach(wrapper => {
      wrapper.classList.remove('has-error');
      const error = wrapper.querySelector('.field-error');
      if (error) error.remove();
      const input = wrapper.querySelector('input, textarea, select');
      if (input) input.removeAttribute('aria-invalid');
    });
  }

  function paintErrors(errors) {
    QR.TYPES_BY_ID[state.type].fields.forEach(field => {
      if (errors[field.name]) setFieldError(field.name, errors[field.name]);
      else clearFieldError(field.name);
    });
  }

  function setFormNote(message, type = '') {
    const note = $('#formNote');
    if (!note) return;
    note.textContent = message;
    note.classList.remove('is-error', 'is-success');
    if (type) note.classList.add('is-' + type);
  }

  /* ======================================================================
     RENDER PIPELINE
     ====================================================================== */
  const scheduleRefresh = debounce(() => {
    if (state.live) refresh({ validate: false });
    else setFormNote('Live preview is off — press Generate QR code to update.');
  }, 170);

  function refresh({ validate = false } = {}) {
    const result = QR.build(state.type, currentValues());
    state.errors = result.errors;
    if (validate) {
      state.showErrors = true;
      clearAllFieldErrors();
      paintErrors(result.errors);
    }

    if (!result.ok) {
      state.matrix = null;
      state.payload = '';
      state.label = '';
      const messages = Object.values(result.errors).filter(Boolean);
      showPreviewEmpty(
        messages.length ? 'Check your details' : 'Your QR code will appear here',
        messages[0] || 'Add some content on the left and it renders instantly — no uploads, no waiting.'
      );
      updateMeta();
      updateWarnings([]);
      updateExportSummary();
      if (validate) {
        setFormNote(messages[0] || 'Please complete the form.', 'error');
        if (messages.length) toast(messages[0], { type: 'error', title: 'Check your input' });
      }
      return false;
    }

    state.payload = result.payload;
    state.label = result.label;

    let matrix;
    try {
      matrix = QR.encode(result.payload, state.design.ecc);
    } catch (error) {
      state.matrix = null;
      showPreviewEmpty('This content is too large', error.message);
      updateMeta();
      updateWarnings([]);
      updateExportSummary();
      if (validate) {
        setFormNote(error.message, 'error');
        toast(error.message, { type: 'error', title: 'Content too long', timeout: 7000 });
      }
      return false;
    }

    state.matrix = matrix;
    try {
      state.svgMarkup = QR.renderSVG({
        matrix,
        design: state.design,
        includeQuiet: true,
        title: 'QR code preview'
      });
    } catch (error) {
      console.error(error);
      showPreviewEmpty('Preview unavailable', 'This browser could not render the QR preview.');
      return false;
    }

    showPreviewSVG(state.svgMarkup);
    updateMeta();
    updateWarnings(QR.analyze({ matrix, design: state.design, includeQuiet: true }));
    updateExportSummary();

    if (validate) {
      setFormNote('QR code generated. Test it with your phone before publishing.', 'success');
      toast('QR code generated — remember to scan-test it.', { type: 'success', title: 'Ready' });
    }
    return true;
  }

  function showPreviewEmpty(title, text) {
    const wrap = $('#qrCanvasWrap');
    const empty = $('#qrEmpty');
    wrap.classList.add('is-empty');
    wrap.replaceChildren();
    empty.hidden = false;
    $('#qrEmptyTitle').textContent = title;
    $('#qrEmptyText').textContent = text;
    const sub = $('#previewSub');
    if (sub) sub.textContent = 'Waiting for valid content';
  }

  function showPreviewSVG(markup) {
    const wrap = $('#qrCanvasWrap');
    const empty = $('#qrEmpty');
    wrap.classList.remove('is-empty');
    wrap.innerHTML = markup; // generated by our own renderer, never user input
    empty.hidden = true;
    const sub = $('#previewSub');
    if (sub) sub.textContent = `${QR.TYPES_BY_ID[state.type].name} · live preview`;
  }

  function updateMeta() {
    const type = QR.TYPES_BY_ID[state.type];
    const matrix = state.matrix;
    $('#metaType').textContent = type ? type.name : '—';
    $('#metaDims').textContent = matrix
      ? `${matrix.moduleCount} × ${matrix.moduleCount} modules`
      : '—';
    $('#metaEcc').textContent = `${state.design.ecc} (~${ECC_PERCENT[state.design.ecc]}%)`;

    const colors = $('#metaColors');
    colors.replaceChildren();
    const dots = el('span', { class: 'meta__v--colors' }, [
      el('span', {
        class: 'color-dot',
        style: `background:${state.design.fg}`,
        title: `Foreground ${state.design.fg}`
      }),
      el('span', {
        class: 'color-dot',
        style: state.design.transparent
          ? 'background:repeating-conic-gradient(#d1d5db 0 25%, #ffffff 0 50%) 0 0/8px 8px'
          : `background:${state.design.bg}`,
        title: state.design.transparent ? 'Transparent background' : `Background ${state.design.bg}`
      }),
      el('span', { text: state.design.transparent ? 'transparent' : state.design.bg })
    ]);
    colors.append(dots);

    $('#metaLogo').textContent = state.design.logo && state.design.logo.dataUrl
      ? `${state.design.logo.size}% · padding ${state.design.logo.padding}%`
      : 'None';

    $('#metaBytes').textContent = matrix ? `${formatBytes(matrix.bytes)} · ${state.design.ecc}` : '—';
  }

  function updateWarnings(notes) {
    const list = $('#warningList');
    list.replaceChildren();
    notes.forEach(note => {
      list.append(el('div', { class: `warning warning--${note.level}` }, [
        U.iconNode(note.level === 'danger' ? 'alert' : note.level === 'ok' ? 'check' : 'alert'),
        el('span', { text: note.text })
      ]));
    });
  }

  function updateExportSummary() {
    const dims = resolveDimensions();
    const format = state.export.format;
    const label = Exporter.FORMATS[format].label;
    syncDownloadLabel();
    $('#exportBadge').textContent = label;
    const estimate = $('#exportEstimate');
    if (!state.matrix) {
      estimate.textContent = 'Generate a QR code to enable downloads.';
    } else if (format === 'svg') {
      estimate.textContent = 'Vector file — infinitely sharp, ideal for print.';
    } else if (state.design.transparent && format === 'png') {
      estimate.textContent = 'Transparent PNG — place it on a light background before scanning.';
    } else if (format === 'jpeg') {
      estimate.textContent = 'JPEG cannot store transparency; the background color is used.';
    } else {
      estimate.textContent = `Rendered locally at ${dims.width}px — no data leaves your browser.`;
    }
  }

  function resolveDimensions() {
    if (state.export.size === 'custom') {
      const width = clamp(Number(state.export.customW) || 1200, 128, Exporter.MAX_PX);
      const height = clamp(Number(state.export.customH) || 1200, 128, Exporter.MAX_PX);
      return { width, height };
    }
    const size = Number(state.export.size) || 1024;
    return { width: size, height: size };
  }

  /* ======================================================================
     DESIGN CONTROLS
     ====================================================================== */
  function syncDesignControls() {
    const d = state.design;
    $('#fgColor').value = d.fg.toLowerCase();
    $('#fgHex').value = d.fg;
    $('#bgColor').value = d.bg.toLowerCase();
    $('#bgHex').value = d.bg;
    $('#eyeColor').value = d.eyeColor.toLowerCase();
    $('#eyeHex').value = d.eyeColor;
    $('#eyeColorToggle').checked = d.eyeColorEnabled;
    $('#eyeColor').disabled = !d.eyeColorEnabled;
    $('#eyeHex').disabled = !d.eyeColorEnabled;
    $('#marginRange').value = String(d.margin);
    $('#marginValue').textContent = `${d.margin} module${d.margin === 1 ? '' : 's'}`;
    $('#eccGroup').value = d.ecc;
    $('#transparentBg').checked = d.transparent;

    const moduleRadio = $(`input[name="moduleStyle"][value="${d.moduleStyle}"]`);
    if (moduleRadio) moduleRadio.checked = true;
    const eyeRadio = $(`input[name="eyeStyle"][value="${d.eyeStyle}"]`);
    if (eyeRadio) eyeRadio.checked = true;

    const logo = d.logo;
    $('#logoControls').hidden = !(logo && logo.dataUrl);
    if (logo && logo.dataUrl) {
      $('#logoSizeRange').value = String(logo.size);
      $('#logoSizeValue').textContent = `${logo.size}%`;
      $('#logoPaddingRange').value = String(logo.padding);
      $('#logoPaddingValue').textContent = `${logo.padding}%`;
      $('#logoBgColor').value = String(logo.bg).toLowerCase();
      $('#logoBgHex').value = logo.bg;
      $('#logoRound').checked = logo.round !== false;
      const preview = $('#logoPreview');
      preview.src = logo.dataUrl;
      preview.hidden = false;
      $('#logoDropContent').hidden = true;
    } else {
      const preview = $('#logoPreview');
      preview.removeAttribute('src');
      preview.hidden = true;
      $('#logoDropContent').hidden = false;
    }
    updatePresetState();
  }

  function renderPresets() {
    const grid = $('#presetGrid');
    grid.replaceChildren();
    PRESETS.forEach(preset => {
      const button = el('button', {
        class: 'preset',
        type: 'button',
        'aria-pressed': 'false',
        title: `${preset.fg} on ${preset.bg}`,
        dataset: { fg: preset.fg, bg: preset.bg }
      }, [
        el('span', { class: 'preset__chips', 'aria-hidden': 'true' }, [
          el('i', { style: `background:${preset.bg}` }),
          el('i', { style: `background:${preset.fg}` })
        ]),
        el('span', { text: preset.name })
      ]);
      grid.append(button);
    });
  }

  function updatePresetState() {
    $$('#presetGrid .preset').forEach(button => {
      const match = normalizeHex(button.dataset.fg) === state.design.fg &&
        normalizeHex(button.dataset.bg) === state.design.bg;
      button.setAttribute('aria-pressed', String(Boolean(match)));
    });
  }

  function applyPreset(fg, bg) {
    state.design.fg = normalizeHex(fg) || state.design.fg;
    state.design.bg = normalizeHex(bg) || state.design.bg;
    if (state.design.transparent) {
      state.design.transparent = false;
      $('#transparentBg').checked = false;
    }
    $('#fgColor').value = state.design.fg.toLowerCase();
    $('#fgHex').value = state.design.fg;
    $('#bgColor').value = state.design.bg.toLowerCase();
    $('#bgHex').value = state.design.bg;
    updatePresetState();
    persistDesign();
    refresh();
  }

  function bindColorPair(colorEl, hexEl, options) {
    const getter = options.get;

    colorEl.addEventListener('input', () => {
      const hex = normalizeHex(colorEl.value);
      if (!hex) return;
      options.apply(hex);
      hexEl.value = hex;
      updatePresetState();
      refresh();
    });

    hexEl.addEventListener('input', () => {
      const hex = normalizeHex(hexEl.value);
      if (!hex) return;
      options.apply(hex);
      colorEl.value = hex.toLowerCase();
      updatePresetState();
      refresh();
    });

    hexEl.addEventListener('blur', () => {
      const hex = normalizeHex(hexEl.value);
      if (hex) {
        hexEl.value = hex;
        options.apply(hex);
      } else {
        hexEl.value = getter();
        toast('Enter a valid hex color such as #1D4ED8.', { type: 'error', title: 'Invalid color' });
      }
    });
  }

  function persistDesign() {
    Store.setPrefs({ design: { ...state.design, logo: state.design.logo } });
  }

  /* ======================================================================
     LOGO
     ====================================================================== */
  const MAX_LOGO_BYTES = (QRS_CONFIG.limits && QRS_CONFIG.limits.logoBytes) || 2 * 1024 * 1024;
  const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

  async function handleLogoFile(file) {
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast('Use a PNG, JPEG, WEBP or SVG file for the logo.', { type: 'error', title: 'Unsupported format' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast(`That file is ${formatBytes(file.size)}. Logos must be under ${formatBytes(MAX_LOGO_BYTES)}.`, {
        type: 'error', title: 'Logo too large'
      });
      return;
    }

    $('#qrLoading').hidden = false;
    try {
      const dataUrl = await processLogo(file);
      const image = await QR.loadImage(dataUrl);
      state.logoImage = image;
      state.design.logo = {
        dataUrl,
        name: file.name || 'logo',
        size: state.design.logo && state.design.logo.size ? state.design.logo.size : 22,
        padding: state.design.logo && state.design.logo.padding !== undefined ? state.design.logo.padding : 12,
        bg: state.design.logo && state.design.logo.bg ? state.design.logo.bg : '#FFFFFF',
        round: true
      };
      if (state.design.ecc === 'L' || state.design.ecc === 'M') {
        state.design.ecc = 'H';
        $('#eccGroup').value = 'H';
        toast('Error correction raised to H so scanners can rebuild the covered modules.', {
          type: 'info', title: 'Logo added', timeout: 6000
        });
      } else {
        toast('Logo added. Keep it small and scan-test the result.', { type: 'success', title: 'Logo added' });
      }
      syncDesignControls();
      persistDesign();
      refresh();
    } catch (error) {
      console.error(error);
      toast(error.message || 'That image could not be read.', { type: 'error', title: 'Logo error' });
    } finally {
      $('#qrLoading').hidden = true;
    }
  }

  /** Read a logo file and downscale it so saved designs stay small. */
  function processLogo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => {
        const source = String(reader.result || '');
        const image = new Image();
        image.onerror = () => reject(new Error('That image appears to be corrupted.'));
        image.onload = () => {
          try {
            const max = 480;
            const ratio = Math.min(1, max / Math.max(image.naturalWidth || max, image.naturalHeight || max));
            const width = Math.max(1, Math.round((image.naturalWidth || max) * ratio));
            const height = Math.max(1, Math.round((image.naturalHeight || max) * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
          } catch (error) {
            reject(new Error('This image could not be processed. Try a PNG file.'));
          }
        };
        image.src = source;
      };
      reader.readAsDataURL(file);
    });
  }

  function restoreLogo() {
    const logo = state.design.logo;
    if (!logo || !logo.dataUrl) return;
    QR.loadImage(logo.dataUrl)
      .then(image => { state.logoImage = image; refresh(); })
      .catch(() => {
        state.design.logo = null;
        syncDesignControls();
        refresh();
      });
  }

  function removeLogo() {
    state.design.logo = null;
    state.logoImage = null;
    const input = $('#logoInput');
    if (input) input.value = '';
    syncDesignControls();
    persistDesign();
    refresh();
    toast('Logo removed.', { type: 'info' });
  }

  /* ======================================================================
     EXPORT CONTROLS
     ====================================================================== */
  function syncExportControls() {
    const e = state.export;
    const formatRadio = $(`input[name="format"][value="${e.format}"]`);
    if (formatRadio) formatRadio.checked = true;
    $('#sizeSelect').value = e.size;
    $('#customW').value = String(clamp(Number(e.customW) || 1200, 128, Exporter.MAX_PX));
    $('#customH').value = String(clamp(Number(e.customH) || 1200, 128, Exporter.MAX_PX));
    $('#jpegQuality').value = String(e.quality);
    $('#jpegQualityValue').textContent = `${e.quality}%`;
    $('#includeQuietZone').checked = e.includeQuiet;
    $('#jpegQualityField').hidden = e.format !== 'jpeg';
    $('#customSizeField').hidden = e.size !== 'custom';
    $('#qrStage').classList.toggle('is-checker', Boolean(e.checker));
    $('#checkerToggle').setAttribute('aria-pressed', String(Boolean(e.checker)));
    updateFormatHint();
  }

  function updateFormatHint() {
    const hints = {
      png: 'PNG supports transparency and is best for most uses.',
      svg: 'SVG is a true vector file generated from your design — perfect for print.',
      jpeg: 'JPEG is smaller but cannot store transparency.'
    };
    $('#formatHint').textContent = hints[state.export.format] || hints.png;
  }

  function updateExportPrefs(patch) {
    state.export = { ...state.export, ...patch };
    Store.setPrefs({ export: state.export });
    updateExportSummary();
  }

  /** Canvas exports need the decoded image, not just the data URL. */
  async function ensureLogoImage() {
    if (!state.design.logo || !state.design.logo.dataUrl) return null;
    if (state.logoImage) return state.logoImage;
    try {
      state.logoImage = await QR.loadImage(state.design.logo.dataUrl);
    } catch (error) {
      state.logoImage = null;
    }
    return state.logoImage;
  }

  async function handleDownload(options = {}) {
    if (!state.matrix) {
      toast('Generate a valid QR code first.', { type: 'error' });
      refresh({ validate: true });
      return;
    }
    const button = options.button || $('#downloadBtn');
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Rendering…';

    const { width, height } = resolveDimensions();
    const logoImage = await ensureLogoImage();
    try {
      const result = await Exporter.download({
        format: state.export.format,
        matrix: state.matrix,
        design: state.design,
        width,
        height,
        includeQuiet: state.export.includeQuiet,
        quality: state.export.quality,
        logoImage,
        baseName: currentBaseName()
      });
      addToHistory();
      toast(`${result.filename} · ${formatBytes(result.blob.size)}`, { type: 'success', title: 'Downloaded' });
      setFormNote('Exported. Scan-test the downloaded file with your phone camera before publishing.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'The download failed. Please try again.', { type: 'error', title: 'Export failed', timeout: 7000 });
    } finally {
      state.busy = false;
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      syncDownloadLabel();
    }
  }

  function syncDownloadLabel() {
    const dims = resolveDimensions();
    const label = Exporter.FORMATS[state.export.format].label;
    const sized = state.export.size === 'custom'
      ? `${dims.width} × ${dims.height}`
      : `${dims.width} × ${dims.width}`;
    $('#downloadBtn').replaceChildren(
      U.iconNode('download'),
      document.createTextNode(` Download ${label} · ${sized}px`)
    );
  }

  function currentBaseName() {
    if (state.editingId) {
      const item = state.saved.find(entry => entry.id === state.editingId);
      if (item && item.name) return item.name;
    }
    return safeFileName(state.label || QR.TYPES_BY_ID[state.type].name, 'qr-studio');
  }

  async function handleCopyContent() {
    if (!state.payload) {
      toast('There is no content to copy yet.', { type: 'warn' });
      return;
    }
    try {
      await copyText(state.payload);
      toast('Encoded content copied to the clipboard.', { type: 'success', title: 'Copied' });
    } catch (error) {
      toast('Clipboard access was blocked by the browser. Select the content manually instead.', { type: 'error' });
    }
  }

  async function handleCopyImage() {
    if (!state.matrix) {
      toast('Generate a valid QR code first.', { type: 'error' });
      return;
    }
    if (!Exporter.canCopyImage()) {
      toast('Copying images is not supported in this browser. Use Download instead.', { type: 'warn', title: 'Not supported' });
      return;
    }
    try {
      await Exporter.copyImage({
        matrix: state.matrix,
        design: state.design,
        width: 1024,
        includeQuiet: true,
        logoImage: await ensureLogoImage()
      });
      toast('QR image copied to the clipboard.', { type: 'success', title: 'Copied' });
    } catch (error) {
      toast(error.message || 'The image could not be copied.', { type: 'error' });
    }
  }

  async function handleShare() {
    if (!state.matrix) {
      toast('Generate a valid QR code first.', { type: 'error' });
      return;
    }
    if (!Exporter.canShareText()) {
      toast('The Web Share API is not available in this browser. Download or copy instead.', { type: 'warn', title: 'Not supported' });
      return;
    }
    try {
      const mode = await Exporter.share({
        matrix: state.matrix,
        design: state.design,
        payload: state.payload,
        includeQuiet: true,
        logoImage: await ensureLogoImage(),
        title: 'QR Studio',
        text: `QR code for ${state.label || QR.TYPES_BY_ID[state.type].name}`
      });
      toast(mode === 'files' ? 'QR image shared.' : 'Content shared.', { type: 'success', title: 'Shared' });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      toast('Sharing failed. You can still download the file.', { type: 'error' });
    }
  }

  function openFullscreenPreview() {
    if (!state.matrix) {
      toast('Generate a QR code first.', { type: 'warn' });
      return;
    }
    const node = el('div', { class: 'modal-preview', html: state.svgMarkup });
    infoDialog({
      title: 'QR code preview',
      text: `${QR.TYPES_BY_ID[state.type].name} · ${state.matrix.moduleCount} × ${state.matrix.moduleCount} modules · error correction ${state.design.ecc}`,
      node
    });
  }

  /* ======================================================================
     SAVE / EDIT / DELETE
     ====================================================================== */
  async function handleSave() {
    if (!refresh({ validate: true })) return;

    const existing = state.editingId ? state.saved.find(item => item.id === state.editingId) : null;
    const suggestion = existing ? existing.name : truncate(state.label || QR.TYPES_BY_ID[state.type].name, 50);
    const name = await promptDialog({
      title: existing ? 'Update saved QR code' : 'Save this QR code',
      text: existing
        ? 'Update the saved copy with the current content and design.'
        : 'Give it a name so you can find it later. Everything stays in this browser.',
      label: 'Name',
      value: suggestion,
      placeholder: 'e.g. Instagram profile',
      confirmLabel: existing ? 'Update' : 'Save'
    });
    if (name === null) return;

    const record = {
      id: existing ? existing.id : uid(),
      name: name || suggestion,
      type: state.type,
      values: currentValues(),
      design: state.design,
      payload: state.payload,
      label: state.label,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    const result = Store.saveCode(record);
    if (!result.ok) {
      toast(result.message || 'This QR code could not be saved.', { type: 'error', title: 'Not saved', timeout: 7000 });
      return;
    }

    state.editingId = record.id;
    populateSaved();
    addToHistory(record.name);
    setFormNote(`Saved as “${record.name}”.`, 'success');
    toast(existing ? 'Saved QR code updated.' : `Saved as “${record.name}”.`, { type: 'success', title: 'Saved' });
  }

  function loadSavedItem(id, { silent = false } = {}) {
    const item = state.saved.find(entry => entry.id === id);
    if (!item) {
      toast('That saved QR code could not be found.', { type: 'error' });
      return;
    }
    state.valuesByType[item.type] = { ...ensureValues(item.type), ...item.values };
    state.design = { ...DEFAULT_DESIGN, ...item.design };
    state.editingId = item.id;
    state.type = item.type;
    state.showErrors = false;

    $$('#typeGrid .type-btn').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.type === state.type));
    });
    updateTypeHint();
    renderFields();
    syncDesignControls();
    persistDesign();

    state.logoImage = null;
    if (state.design.logo && state.design.logo.dataUrl) {
      QR.loadImage(state.design.logo.dataUrl)
        .then(image => { state.logoImage = image; refresh(); })
        .catch(() => { state.design.logo = null; syncDesignControls(); refresh(); });
    } else {
      refresh();
    }

    setFormNote(`Editing “${item.name}”. Downloads will use this name.`, 'success');
    if (!silent) {
      scrollToSection('studio');
      toast(`Loaded “${item.name}” into the studio.`, { type: 'success', title: 'Opened' });
    }
  }

  async function duplicateSavedItem(id) {
    const result = Store.duplicateCode(id);
    if (!result.ok) {
      toast(result.message || 'Could not duplicate this QR code.', { type: 'error' });
      return;
    }
    populateSaved();
    toast(`Duplicated as “${result.data.name}”.`, { type: 'success' });
  }

  async function deleteSavedItem(id) {
    const item = state.saved.find(entry => entry.id === id);
    const ok = await confirmDialog({
      title: 'Delete saved QR code?',
      text: item ? `“${item.name}” will be removed from this browser. This cannot be undone.` : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    const result = Store.deleteCode(id);
    if (!result.ok) {
      toast(result.message || 'Could not delete this QR code.', { type: 'error' });
      return;
    }
    if (state.editingId === id) state.editingId = null;
    populateSaved();
    toast('QR code deleted.', { type: 'info' });
  }

  async function downloadSavedItem(id) {
    const item = state.saved.find(entry => entry.id === id);
    if (!item) return;
    try {
      const matrix = QR.encode(item.payload, item.design.ecc);
      const logoImage = item.design.logo && item.design.logo.dataUrl
        ? await QR.loadImage(item.design.logo.dataUrl).catch(() => null)
        : null;
      const result = await Exporter.download({
        format: state.export.format === 'svg' ? 'svg' : state.export.format,
        matrix,
        design: item.design,
        width: resolveDimensions().width,
        height: resolveDimensions().height,
        includeQuiet: state.export.includeQuiet,
        quality: state.export.quality,
        logoImage,
        baseName: item.name
      });
      Store.addHistory({ ...item, id: uid(), payload: item.payload, createdAt: Date.now() });
      populateHistory();
      toast(`${result.filename} · ${formatBytes(result.blob.size)}`, { type: 'success', title: 'Downloaded' });
    } catch (error) {
      console.error(error);
      toast(error.message || 'This QR code could not be exported.', { type: 'error' });
    }
  }

  /* ======================================================================
     SAVED LIBRARY RENDERING
     ====================================================================== */
  function initSavedFilter() {
    const select = $('#savedFilter');
    QR.QR_TYPES.forEach(type => {
      select.append(el('option', { value: type.id, text: type.name }));
    });
  }

  function populateSaved() {
    state.saved = Store.getSaved();
    renderSavedGrid();
  }

  function renderSavedGrid() {
    const grid = $('#savedGrid');
    const empty = $('#savedEmpty');
    const term = ($('#savedSearch').value || '').trim().toLowerCase();
    const filter = $('#savedFilter').value;

    const filtered = state.saved.filter(item => {
      const matchesType = filter === 'all' || item.type === filter;
      if (!matchesType) return false;
      if (!term) return true;
      const haystack = [item.name, item.label, item.payload, QR.TYPES_BY_ID[item.type] ? QR.TYPES_BY_ID[item.type].name : '']
        .join(' ').toLowerCase();
      return haystack.includes(term);
    });

    grid.replaceChildren();
    filtered.forEach(item => grid.append(buildSavedCard(item)));

    empty.hidden = filtered.length > 0;
    if (!filtered.length && state.saved.length) {
      empty.querySelector('.empty-state__title').textContent = 'No matches';
      empty.querySelector('.empty-state__text').textContent = 'Try a different search term or type filter.';
    } else {
      empty.querySelector('.empty-state__title').textContent = 'Nothing saved yet';
      empty.querySelector('.empty-state__text').textContent = 'Generate a QR code you like and press Save. It will live here with all of its settings.';
    }

    $('#savedCount').textContent = state.saved.length
      ? `${filtered.length} of ${state.saved.length} saved QR code${state.saved.length === 1 ? '' : 's'}`
      : '';
  }

  function buildSavedCard(item) {
    const type = QR.TYPES_BY_ID[item.type];
    const thumb = el('div', { class: 'saved-card__thumb' });
    try {
      const matrix = QR.encode(item.payload, item.design.ecc);
      const markup = QR.renderSVG({
        matrix,
        design: { ...item.design, margin: 2 },
        size: 120,
        includeQuiet: true,
        transparent: false,
        title: `${item.name} thumbnail`
      });
      thumb.innerHTML = markup; // generated markup only
    } catch (error) {
      thumb.append(el('span', { class: 'saved-card__meta', text: 'N/A' }));
    }

    const actions = el('div', { class: 'saved-card__actions' }, [
      cardAction('open', 'eye', 'Open in studio'),
      cardAction('download', 'download', 'Download'),
      cardAction('duplicate', 'copy', 'Duplicate'),
      cardAction('delete', 'trash', 'Delete')
    ]);
    actions.dataset.id = item.id;

    return el('article', { class: 'saved-card' }, [
      el('div', { class: 'saved-card__top' }, [
        thumb,
        el('div', { class: 'saved-card__info' }, [
          el('span', { class: 'saved-card__name', text: item.name || 'Untitled' }),
          el('span', { class: 'saved-card__meta', text: type ? type.name : item.type }),
          el('span', { class: 'saved-card__meta', text: `Updated ${formatRelativeDate(item.updatedAt)}` })
        ])
      ]),
      actions
    ]);
  }

  function cardAction(action, iconName, label) {
    return el('button', {
      class: 'icon-btn',
      type: 'button',
      'data-action': action,
      title: label,
      'aria-label': label
    }, [U.iconNode(iconName)]);
  }

  function handleSavedAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.closest('.saved-card__actions').dataset.id;
    const action = button.dataset.action;
    if (action === 'open') loadSavedItem(id);
    else if (action === 'download') downloadSavedItem(id);
    else if (action === 'duplicate') duplicateSavedItem(id);
    else if (action === 'delete') deleteSavedItem(id);
  }

  /* ======================================================================
     HISTORY
     ====================================================================== */
  function addToHistory(name) {
    if (!state.payload || !state.matrix) return;
    const entry = {
      id: uid(),
      type: state.type,
      values: currentValues(),
      design: state.design,
      payload: state.payload,
      label: name || state.label || QR.TYPES_BY_ID[state.type].name,
      createdAt: Date.now()
    };
    const result = Store.addHistory(entry);
    if (!result.ok && result.message) {
      console.warn('[QR Studio] History not saved:', result.message);
    }
    populateHistory();
  }

  function populateHistory() {
    state.history = Store.getHistory();
    const list = $('#historyList');
    const empty = $('#historyEmpty');
    list.replaceChildren();

    state.history.forEach(entry => {
      const type = QR.TYPES_BY_ID[entry.type];
      const title = entry.label || (type ? type.name : 'QR code');
      const item = el('li', { class: 'history-item' }, [
        el('span', { class: 'history-item__icon' }, [U.iconNode(type ? type.icon : 'qr')]),
        el('div', { class: 'history-item__body' }, [
          el('span', { class: 'history-item__title', text: title }),
          el('span', { class: 'history-item__meta' }, [
            el('span', { text: type ? type.name : entry.type }),
            el('span', { text: formatRelativeDate(entry.createdAt), title: formatDate(entry.createdAt) })
          ])
        ]),
        el('div', { class: 'history-item__actions' }, [
          el('button', {
            class: 'icon-btn', type: 'button', title: 'Reopen in the studio', 'aria-label': 'Reopen in the studio',
            'data-history': 'open', 'data-id': entry.id
          }, [U.iconNode('eye')]),
          el('button', {
            class: 'icon-btn', type: 'button', title: 'Download PNG', 'aria-label': 'Download PNG',
            'data-history': 'download', 'data-id': entry.id
          }, [U.iconNode('download')])
        ])
      ]);
      list.append(item);
    });

    empty.hidden = state.history.length > 0;
  }

  async function handleHistoryAction(event) {
    const button = event.target.closest('[data-history]');
    if (!button) return;
    const entry = state.history.find(item => item.id === button.dataset.id);
    if (!entry) return;

    if (button.dataset.history === 'open') {
      const type = QR.TYPES_BY_ID[entry.type];
      if (!type) {
        toast('This history entry uses an unknown QR type.', { type: 'error' });
        return;
      }
      state.valuesByType[entry.type] = { ...ensureValues(entry.type), ...entry.values };
      state.design = { ...DEFAULT_DESIGN, ...entry.design, logo: null };
      state.logoImage = null;
      state.type = entry.type;
      state.editingId = null;
      state.showErrors = false;
      $$('#typeGrid .type-btn').forEach(node => {
        node.setAttribute('aria-pressed', String(node.dataset.type === entry.type));
      });
      updateTypeHint();
      renderFields();
      syncDesignControls();
      persistDesign();
      refresh();
      scrollToSection('studio');
      toast('Reopened from history. Logos are not stored in history, so re-upload yours if needed.', {
        type: 'info', title: 'Reopened', timeout: 6000
      });
    }

    if (button.dataset.history === 'download') {
      try {
        const matrix = QR.encode(entry.payload, entry.design.ecc);
        const logoImage = entry.design.logo && entry.design.logo.dataUrl
          ? await QR.loadImage(entry.design.logo.dataUrl).catch(() => null)
          : null;
        const { width, height } = resolveDimensions();
        const result = await Exporter.download({
          format: state.export.format === 'svg' ? 'svg' : state.export.format,
          matrix,
          design: entry.design,
          width, height,
          includeQuiet: state.export.includeQuiet,
          quality: state.export.quality,
          logoImage,
          baseName: entry.label || 'qr-studio'
        });
        toast(`${result.filename} · ${formatBytes(result.blob.size)}`, { type: 'success', title: 'Downloaded' });
      } catch (error) {
        toast(error.message || 'This code could not be exported.', { type: 'error' });
      }
    }
  }

  async function clearHistory() {
    if (!state.history.length) {
      toast('There is no history to clear.', { type: 'info' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear recent activity?',
      text: 'This removes the recent QR code list from this browser. Saved QR codes are not affected.',
      confirmLabel: 'Clear history',
      danger: true
    });
    if (!ok) return;
    const result = Store.clearHistory();
    if (!result.ok) {
      toast(result.message || 'History could not be cleared.', { type: 'error' });
      return;
    }
    populateHistory();
    toast('Recent activity cleared.', { type: 'info' });
  }

  /* ======================================================================
     TEMPLATES
     ====================================================================== */
  function renderTemplates() {
    const grid = $('#templateGrid');
    grid.replaceChildren();
    QR.TEMPLATES.forEach(template => {
      const type = QR.TYPES_BY_ID[template.type];
      const button = el('button', {
        class: 'template-card',
        type: 'button',
        dataset: { template: template.id },
        title: `Use the ${template.name} template`
      }, [
        el('span', { class: 'template-card__icon' }, [U.iconNode(template.icon)]),
        el('span', { class: 'template-card__body' }, [
          el('strong', { text: template.name }),
          el('span', { text: template.description }),
          el('span', { class: 'template-card__type', text: type ? type.name : template.type })
        ])
      ]);
      grid.append(button);
    });
  }

  function applyTemplate(templateId) {
    const template = QR.TEMPLATES.find(item => item.id === templateId);
    if (!template) return;
    state.type = template.type;
    state.valuesByType[template.type] = { ...ensureValues(template.type), ...template.values };
    state.editingId = null;
    state.showErrors = false;
    state.design = { ...state.design }; // keep the current design

    $$('#typeGrid .type-btn').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.type === template.type));
    });
    updateTypeHint();
    renderFields();
    refresh({ validate: false });
    scrollToSection('studio');
    toast(`“${template.name}” loaded with example values — replace them with your own.`, {
      type: 'success', title: 'Template applied', timeout: 5200
    });
    setFormNote('Template applied. Example values are clearly placeholders — edit them before exporting.', 'success');
  }

  /* ======================================================================
     NAV / FAQ / SOCIAL
     ====================================================================== */
  function initSocialLinks() {
    const social = (QRS_CONFIG.social) || {};
    $$('[data-social]').forEach(link => {
      const key = link.dataset.social;
      const url = social[key];
      if (url && /^https?:\/\//i.test(url)) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else if (url && /^mailto:/i.test(url)) {
        link.href = url;
      } else {
        link.href = '#';
        link.title = 'Add your link in the QRS_CONFIG block in js/utilities.js';
        link.addEventListener('click', event => {
          event.preventDefault();
          toast('No link configured yet. Add your URL to QRS_CONFIG.social in js/utilities.js.', {
            type: 'info', title: 'Link not configured', timeout: 6500
          });
        });
      }
    });
  }

  function initAccordion() {
    $$('.faq__q').forEach(button => {
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        const panel = button.nextElementSibling;
        if (panel) panel.hidden = expanded;
      });
    });
  }

  function toggleNav(force) {
    const nav = $('#primaryNav');
    const toggle = $('#navToggle');
    const open = typeof force === 'boolean' ? force : !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  }

  /* ======================================================================
     RESET
     ====================================================================== */
  function resetForm() {
    const type = QR.TYPES_BY_ID[state.type];
    const values = {};
    type.fields.forEach(field => { values[field.name] = field.type === 'checkbox' ? false : ''; });
    Object.assign(values, FIELD_DEFAULTS[state.type] || {});
    state.valuesByType[state.type] = values;
    state.showErrors = false;
    state.editingId = null;
    renderFields();
    clearAllFieldErrors();
    setFormNote('Form cleared.');
    refresh({ validate: false });
    toast('Form cleared.', { type: 'info' });
  }

  function resetDesign() {
    const logo = state.design.logo;
    state.design = { ...DEFAULT_DESIGN, logo };
    syncDesignControls();
    persistDesign();
    refresh();
    toast('Design reset to the default dark-on-white code.', { type: 'success' });
  }

  async function resetAll() {
    const ok = await confirmDialog({
      title: 'Reset everything?',
      text: 'This clears the current form, the design, the export settings and any uploaded logo. Saved QR codes and history are kept.',
      confirmLabel: 'Reset all',
      danger: true
    });
    if (!ok) return;

    const type = QR.TYPES_BY_ID[state.type];
    const values = {};
    type.fields.forEach(field => { values[field.name] = field.type === 'checkbox' ? false : ''; });
    Object.assign(values, FIELD_DEFAULTS[state.type] || {});
    state.valuesByType[state.type] = values;

    state.design = { ...DEFAULT_DESIGN };
    state.logoImage = null;
    state.export = { ...DEFAULT_EXPORT };
    state.editingId = null;
    state.showErrors = false;

    $('#logoInput').value = '';
    renderFields();
    syncDesignControls();
    syncExportControls();
    Store.setPrefs({ design: state.design, export: state.export });
    refresh({ validate: false });
    setFormNote('Everything reset. Saved codes are untouched.');
    toast('All settings reset.', { type: 'success' });
  }

  /* ======================================================================
     EVENT BINDING
     ====================================================================== */
  function bindEvents() {
    $('#typeGrid').addEventListener('click', event => {
      const button = event.target.closest('.type-btn');
      if (button) selectType(button.dataset.type);
    });

    $('#dynamicFields').addEventListener('input', handleFieldChange);
    $('#dynamicFields').addEventListener('change', handleFieldChange);

    $('#qrForm').addEventListener('submit', event => {
      event.preventDefault();
      refresh({ validate: true });
    });

    $('#resetFormBtn').addEventListener('click', resetForm);
    $('#resetDesignBtn').addEventListener('click', resetDesign);
    $('#resetAllBtn').addEventListener('click', resetAll);

    $('#liveToggle').addEventListener('change', event => {
      state.live = event.target.checked;
      Store.setPrefs({ livePreview: state.live });
      if (state.live) {
        refresh();
        setFormNote('Live preview is on.');
      } else {
        setFormNote('Live preview is off — press Generate QR code to update.');
      }
    });

    /* theme + navigation */
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#navToggle').addEventListener('click', () => toggleNav());
    $$('#primaryNav a').forEach(link => link.addEventListener('click', () => toggleNav(false)));

    /* colors */
    bindColorPair($('#fgColor'), $('#fgHex'), {
      get: () => state.design.fg,
      apply: hex => { state.design.fg = hex; persistDesign(); }
    });
    bindColorPair($('#bgColor'), $('#bgHex'), {
      get: () => state.design.bg,
      apply: hex => {
        state.design.bg = hex;
        if (state.design.transparent) {
          state.design.transparent = false;
          $('#transparentBg').checked = false;
        }
        persistDesign();
      }
    });
    bindColorPair($('#eyeColor'), $('#eyeHex'), {
      get: () => state.design.eyeColor,
      apply: hex => { state.design.eyeColor = hex; persistDesign(); }
    });

    $('#presetGrid').addEventListener('click', event => {
      const button = event.target.closest('.preset');
      if (button) applyPreset(button.dataset.fg, button.dataset.bg);
    });

    $('#eyeColorToggle').addEventListener('change', event => {
      state.design.eyeColorEnabled = event.target.checked;
      $('#eyeColor').disabled = !event.target.checked;
      $('#eyeHex').disabled = !event.target.checked;
      persistDesign();
      refresh();
    });

    $$('input[name="moduleStyle"]').forEach(radio => {
      radio.addEventListener('change', event => {
        if (!event.target.checked) return;
        state.design.moduleStyle = event.target.value;
        persistDesign();
        refresh();
      });
    });

    $$('input[name="eyeStyle"]').forEach(radio => {
      radio.addEventListener('change', event => {
        if (!event.target.checked) return;
        state.design.eyeStyle = event.target.value;
        persistDesign();
        refresh();
      });
    });

    $('#marginRange').addEventListener('input', event => {
      const value = clamp(Number(event.target.value), 0, 10);
      state.design.margin = value;
      $('#marginValue').textContent = `${value} module${value === 1 ? '' : 's'}`;
      refresh();
    });
    $('#marginRange').addEventListener('change', persistDesign);

    $('#eccGroup').addEventListener('change', event => {
      state.design.ecc = event.target.value;
      persistDesign();
      refresh();
      if (state.design.logo && (event.target.value === 'L')) {
        toast('Error correction L with a logo is risky — Q or H is recommended.', { type: 'warn' });
      }
    });

    $('#transparentBg').addEventListener('change', event => {
      state.design.transparent = event.target.checked;
      persistDesign();
      refresh();
    });

    /* logo */
    const drop = $('#logoDrop');
    const fileInput = $('#logoInput');
    fileInput.addEventListener('click', event => event.stopPropagation());
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });
    drop.addEventListener('dragover', event => {
      event.preventDefault();
      drop.classList.add('is-dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
    drop.addEventListener('drop', event => {
      event.preventDefault();
      drop.classList.remove('is-dragover');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handleLogoFile(file);
    });
    fileInput.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) handleLogoFile(file);
    });

    $('#logoSizeRange').addEventListener('input', event => {
      if (!state.design.logo) return;
      state.design.logo.size = clamp(Number(event.target.value), 10, 32);
      $('#logoSizeValue').textContent = `${state.design.logo.size}%`;
      refresh();
    });
    $('#logoSizeRange').addEventListener('change', persistDesign);

    $('#logoPaddingRange').addEventListener('input', event => {
      if (!state.design.logo) return;
      state.design.logo.padding = clamp(Number(event.target.value), 0, 40);
      $('#logoPaddingValue').textContent = `${state.design.logo.padding}%`;
      refresh();
    });
    $('#logoPaddingRange').addEventListener('change', persistDesign);

    bindColorPair($('#logoBgColor'), $('#logoBgHex'), {
      get: () => (state.design.logo ? state.design.logo.bg : '#FFFFFF'),
      apply: hex => { if (state.design.logo) state.design.logo.bg = hex; persistDesign(); }
    });

    $('#logoRound').addEventListener('change', event => {
      if (!state.design.logo) return;
      state.design.logo.round = event.target.checked;
      persistDesign();
      refresh();
    });

    $('#removeLogoBtn').addEventListener('click', removeLogo);

    /* export */
    $$('input[name="format"]').forEach(radio => {
      radio.addEventListener('change', event => {
        if (!event.target.checked) return;
        updateExportPrefs({ format: event.target.value });
        $('#jpegQualityField').hidden = event.target.value !== 'jpeg';
        updateFormatHint();
        syncDownloadLabel();
      });
    });

    $('#sizeSelect').addEventListener('change', event => {
      updateExportPrefs({ size: event.target.value });
      $('#customSizeField').hidden = event.target.value !== 'custom';
      syncDownloadLabel();
    });

    ['#customW', '#customH'].forEach(selector => {
      const input = $(selector);
      input.addEventListener('change', () => {
        const raw = Number(input.value);
        const value = clamp(Number.isFinite(raw) && raw > 0 ? raw : 1200, 128, Exporter.MAX_PX);
        input.value = String(value);
        updateExportPrefs(selector === '#customW' ? { customW: value } : { customH: value });
        syncDownloadLabel();
        if (Number.isFinite(raw) && (raw > Exporter.MAX_PX || raw < 128) && raw > 0) {
          toast(`Custom sizes are limited to 128–${Exporter.MAX_PX}px.`, { type: 'warn' });
        }
      });
    });

    $('#jpegQuality').addEventListener('input', event => {
      const value = clamp(Number(event.target.value), 50, 100);
      $('#jpegQualityValue').textContent = `${value}%`;
      updateExportPrefs({ quality: value });
    });

    $('#includeQuietZone').addEventListener('change', event => {
      updateExportPrefs({ includeQuiet: event.target.checked });
    });

    $('#downloadBtn').addEventListener('click', () => handleDownload());
    $('#copyContentBtn').addEventListener('click', handleCopyContent);
    $('#copyImageBtn').addEventListener('click', handleCopyImage);
    $('#shareBtn').addEventListener('click', handleShare);
    $('#saveBtn').addEventListener('click', handleSave);
    $('#fullscreenPreview').addEventListener('click', openFullscreenPreview);

    $('#checkerToggle').addEventListener('click', () => {
      const next = !state.export.checker;
      updateExportPrefs({ checker: next });
      $('#qrStage').classList.toggle('is-checker', next);
      $('#checkerToggle').setAttribute('aria-pressed', String(next));
    });

    /* saved library */
    $('#savedSearch').addEventListener('input', debounce(renderSavedGrid, 140));
    $('#savedFilter').addEventListener('change', renderSavedGrid);
    $('#savedGrid').addEventListener('click', handleSavedAction);

    /* history */
    $('#historyList').addEventListener('click', handleHistoryAction);
    $('#clearHistoryBtn').addEventListener('click', clearHistory);

    /* templates */
    $('#templateGrid').addEventListener('click', event => {
      const card = event.target.closest('[data-template]');
      if (card) applyTemplate(card.dataset.template);
    });

    /* close mobile nav on outside click / Escape */
    document.addEventListener('click', event => {
      const nav = $('#primaryNav');
      if (!nav.classList.contains('is-open')) return;
      if (event.target.closest('#primaryNav') || event.target.closest('#navToggle')) return;
      toggleNav(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') toggleNav(false);
    });

    window.addEventListener('beforeunload', () => { Store.setPrefs({ design: state.design, export: state.export }); });
  }

  /* keep helper references used in some browsers for debugging */
  window.QRS_APP = {
    state,
    get payload() { return state.payload; },
    refresh,
    loadSavedItem
  };
})();
