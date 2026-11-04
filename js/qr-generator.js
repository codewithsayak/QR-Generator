/* ==========================================================================
   QR Studio — js/qr-generator.js
   The engine: content schemas, structured payload builders, the encoder and
   a custom SVG + Canvas renderer (module styles, eye shapes, logos, margins).
   Encoding itself uses the vendored MIT library js/vendor/qrcode.js
   (qrcode-generator by Kazuhiko Arase).
   ========================================================================== */

const QRS_QR = (function () {
  'use strict';

  const { normalizeHex, digitsOnly, isEmail, isPhone, isLatitude, isLongitude, normalizeUrl, clamp } = window.QRS_UTIL;

  /* ======================================================================
     1. LIBRARY READINESS
     ====================================================================== */
  let libraryReady = typeof window.qrcode === 'function';

  function configureUtf8() {
    if (!libraryReady) return;
    const funcs = window.qrcode.stringToBytesFuncs;
    if (funcs && funcs['UTF-8']) {
      window.qrcode.stringToBytes = funcs['UTF-8'];
    }
  }
  configureUtf8();

  /**
   * Try to load the encoder from the configured CDN if the local file failed.
   * Resolves true/false — the UI shows a clear error when false.
   */
  function ensureLibrary(timeout = 9000) {
    if (libraryReady) return Promise.resolve(true);
    return new Promise(resolve => {
      const src = (window.QRS_CONFIG && QRS_CONFIG.qrCdnFallback) || '';
      if (!src) return resolve(false);
      const script = document.createElement('script');
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        libraryReady = ok;
        configureUtf8();
        resolve(ok);
      };
      const timer = setTimeout(() => finish(typeof window.qrcode === 'function'), timeout);
      script.src = src;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        finish(typeof window.qrcode === 'function');
      };
      script.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      document.head.append(script);
    });
  }

  const isReady = () => libraryReady;

  /* ======================================================================
     2. CONTENT TYPE SCHEMAS
     ----------------------------------------------------------------------
     Each field: name, label, type, placeholder, hint, required, half (pairs
     into a two-column row), options (select), autocomplete, maxlength.
     ====================================================================== */
  const QR_TYPES = [
    {
      id: 'url', name: 'Website', icon: 'link',
      hint: 'Encodes a normal https:// link. Any http(s) URL works with every scanner.',
      fields: [
        { name: 'url', label: 'Website URL', type: 'text', placeholder: 'https://example.com', required: true, autocomplete: 'url', inputmode: 'url', hint: 'If you leave out https:// we add it for you.' }
      ]
    },
    {
      id: 'text', name: 'Plain text', icon: 'text',
      hint: 'Encodes raw text — notes, messages, codes or instructions up to about 2,400 characters.',
      fields: [
        { name: 'text', label: 'Text', type: 'textarea', placeholder: 'Any text you want to share…', required: true, maxlength: 2400 }
      ]
    },
    {
      id: 'email', name: 'Email', icon: 'mail',
      hint: 'Opens the mail app with the recipient, subject and message ready to send (mailto:).',
      fields: [
        { name: 'to', label: 'Email address', type: 'email', placeholder: 'hello@example.com', required: true, autocomplete: 'email' },
        { name: 'subject', label: 'Subject', type: 'text', placeholder: 'Hello from QR Studio' },
        { name: 'message', label: 'Message', type: 'textarea', placeholder: 'Pre-filled message body…' }
      ]
    },
    {
      id: 'phone', name: 'Phone', icon: 'phone',
      hint: 'Starts a phone call when scanned (tel:). Include the country code for international numbers.',
      fields: [
        { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '+91 98765 43210', required: true, autocomplete: 'tel', inputmode: 'tel', hint: 'Spaces, dashes and brackets are removed automatically.' }
      ]
    },
    {
      id: 'whatsapp', name: 'WhatsApp', icon: 'chat',
      hint: 'Uses the official wa.me format so the chat opens with your message pre-filled.',
      fields: [
        { name: 'cc', label: 'Country code', type: 'text', placeholder: '91', required: true, half: true, inputmode: 'numeric', maxlength: 4, hint: 'Digits only, e.g. 91 for India.' },
        { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '98765 43210', required: true, half: true, inputmode: 'tel' },
        { name: 'message', label: 'Pre-filled message', type: 'textarea', placeholder: 'Hi! I would like to know more.' }
      ]
    },
    {
      id: 'wifi', name: 'Wi-Fi', icon: 'wifi',
      hint: 'Joins the network without typing the password. Android and iOS both support this format.',
      fields: [
        { name: 'ssid', label: 'Network name (SSID)', type: 'text', placeholder: 'MyHomeWiFi', required: true, maxlength: 64 },
        { name: 'password', label: 'Password', type: 'password', placeholder: 'Network password', maxlength: 63 },
        { name: 'encryption', label: 'Security type', type: 'select', half: true, options: [
          { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'Open (no password)' }
        ] },
        { name: 'hidden', label: 'This is a hidden network', type: 'checkbox', half: true }
      ]
    },
    {
      id: 'vcard', name: 'Contact', icon: 'user',
      hint: 'A vCard 3.0 contact card — scanning it offers “Add to contacts”.',
      fields: [
        { name: 'firstName', label: 'First name', type: 'text', placeholder: 'Ada', half: true, required: true },
        { name: 'lastName', label: 'Last name', type: 'text', placeholder: 'Lovelace', half: true },
        { name: 'org', label: 'Organization', type: 'text', placeholder: 'Example Studio', half: true },
        { name: 'title', label: 'Job title', type: 'text', placeholder: 'Designer', half: true },
        { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+91 98765 43210', half: true, inputmode: 'tel' },
        { name: 'email', label: 'Email', type: 'email', placeholder: 'ada@example.com', half: true },
        { name: 'website', label: 'Website', type: 'text', placeholder: 'https://example.com', inputmode: 'url' },
        { name: 'address', label: 'Address', type: 'textarea', placeholder: '221B Example Street, Kolkata' }
      ]
    },
    {
      id: 'sms', name: 'SMS', icon: 'message',
      hint: 'Prepares a text message to a number with your text ready to send (SMSTO:).',
      fields: [
        { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '+91 98765 43210', required: true, inputmode: 'tel', autocomplete: 'tel' },
        { name: 'message', label: 'Message', type: 'textarea', placeholder: 'Pre-filled text message…' }
      ]
    },
    {
      id: 'location', name: 'Location', icon: 'pin',
      hint: 'Uses geo: coordinates when provided, otherwise a Google Maps search link for the address.',
      fields: [
        { name: 'label', label: 'Place name or address', type: 'text', placeholder: 'Victoria Memorial, Kolkata' },
        { name: 'lat', label: 'Latitude (optional)', type: 'text', placeholder: '22.5448', half: true, inputmode: 'decimal' },
        { name: 'lng', label: 'Longitude (optional)', type: 'text', placeholder: '88.3426', half: true, inputmode: 'decimal' }
      ]
    },
    {
      id: 'event', name: 'Event', icon: 'calendar',
      hint: 'Encodes a downloadable iCalendar event with start, end, place and description.',
      fields: [
        { name: 'title', label: 'Event name', type: 'text', placeholder: 'QR Studio Workshop', required: true },
        { name: 'location', label: 'Location', type: 'text', placeholder: 'Kolkata, India' },
        { name: 'start', label: 'Starts', type: 'datetime-local', required: true, half: true },
        { name: 'end', label: 'Ends', type: 'datetime-local', half: true },
        { name: 'description', label: 'Description', type: 'textarea', placeholder: 'What is happening and who it is for…' }
      ]
    }
  ];

  const TYPES_BY_ID = QR_TYPES.reduce((acc, type) => { acc[type.id] = type; return acc; }, {});

  /* ======================================================================
     3. STRUCTURED PAYLOAD BUILDERS
     ====================================================================== */
  function escapeVCard(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function escapeWifi(value) {
    return String(value || '').replace(/([\\;,":])/g, '\\$1');
  }

  function escapeICal(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function telSafe(value) {
    const raw = String(value || '').trim();
    const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    return cleaned;
  }

  function icalDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  /** Two weeks from now, formatted for a datetime-local input. */
  function exampleFutureDate(daysAhead, hour) {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    date.setHours(hour, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const BUILDERS = {
    url(values, errors) {
      const raw = String(values.url || '').trim();
      if (!raw) { errors.url = 'Enter a website address.'; return ''; }
      const url = normalizeUrl(raw);
      if (!url) { errors.url = 'That does not look like a valid http(s) website address.'; return ''; }
      return url;
    },

    text(values, errors) {
      const value = String(values.text || '').trim();
      if (!value) { errors.text = 'Enter some text to encode.'; return ''; }
      return value;
    },

    email(values, errors) {
      const to = String(values.to || '').trim();
      if (!to) { errors.to = 'Enter an email address.'; return ''; }
      if (!isEmail(to)) { errors.to = 'Enter a valid email address, e.g. hello@example.com.'; return ''; }
      const params = [];
      if (String(values.subject || '').trim()) params.push('subject=' + encodeURIComponent(values.subject.trim()));
      if (String(values.message || '').trim()) params.push('body=' + encodeURIComponent(values.message.trim()));
      return `mailto:${to}${params.length ? '?' + params.join('&') : ''}`;
    },

    phone(values, errors) {
      const raw = String(values.phone || '').trim();
      if (!raw) { errors.phone = 'Enter a phone number.'; return ''; }
      if (!isPhone(raw)) { errors.phone = 'Enter a valid phone number (6–15 digits), including the country code.'; return ''; }
      return 'tel:' + telSafe(raw);
    },

    whatsapp(values, errors) {
      const cc = digitsOnly(values.cc);
      const number = digitsOnly(values.phone).replace(/^0+/, '');
      if (!cc) errors.cc = 'Country code is digits only, e.g. 91.';
      if (!number) errors.phone = 'Enter the WhatsApp number without the country code.';
      else if (number.length < 6) errors.phone = 'That number looks too short.';
      if (Object.keys(errors).length) return '';
      const text = String(values.message || '').trim();
      return `https://wa.me/${cc}${number}${text ? '?text=' + encodeURIComponent(text) : ''}`;
    },

    wifi(values, errors) {
      const ssid = String(values.ssid || '').trim();
      const security = values.encryption || 'WPA';
      const password = String(values.password || '');
      if (!ssid) { errors.ssid = 'Enter the Wi-Fi network name.'; return ''; }
      if (security !== 'nopass' && !password) {
        errors.password = 'A password is required for WPA and WEP networks.';
        return '';
      }
      let payload = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
      if (security !== 'nopass') payload += `P:${escapeWifi(password)};`;
      if (values.hidden) payload += 'H:true;';
      payload += ';';
      return payload;
    },

    vcard(values, errors) {
      const first = String(values.firstName || '').trim();
      const last = String(values.lastName || '').trim();
      const phone = String(values.phone || '').trim();
      const email = String(values.email || '').trim();
      if (!first && !last) { errors.firstName = 'Enter at least a first or last name.'; return ''; }
      if (phone && !isPhone(phone)) errors.phone = 'Enter a valid phone number.';
      if (email && !isEmail(email)) errors.email = 'Enter a valid email address.';
      if (Object.keys(errors).length) return '';

      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      lines.push(`N:${escapeVCard(last)};${escapeVCard(first)};;;`);
      lines.push(`FN:${escapeVCard([first, last].filter(Boolean).join(' '))}`);
      if (String(values.org || '').trim()) lines.push(`ORG:${escapeVCard(values.org.trim())}`);
      if (String(values.title || '').trim()) lines.push(`TITLE:${escapeVCard(values.title.trim())}`);
      if (phone) lines.push(`TEL;TYPE=CELL:${telSafe(phone)}`);
      if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);
      if (String(values.website || '').trim()) {
        const url = normalizeUrl(values.website);
        if (!url) { errors.website = 'Enter a valid website address.'; return ''; }
        lines.push(`URL:${url}`);
      }
      if (String(values.address || '').trim()) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(values.address.trim().replace(/\r?\n/g, ' '))};;;;`);
      lines.push('END:VCARD');
      return lines.join('\n');
    },

    sms(values, errors) {
      const raw = String(values.phone || '').trim();
      if (!raw) { errors.phone = 'Enter a phone number.'; return ''; }
      if (!isPhone(raw)) { errors.phone = 'Enter a valid phone number (6–15 digits).'; return ''; }
      const message = String(values.message || '').trim();
      return `SMSTO:${telSafe(raw)}${message ? ':' + message : ''}`;
    },

    location(values, errors) {
      const label = String(values.label || '').trim();
      const latRaw = String(values.lat || '').trim();
      const lngRaw = String(values.lng || '').trim();
      const hasLat = latRaw !== '';
      const hasLng = lngRaw !== '';

      if (!label && !hasLat && !hasLng) {
        errors.label = 'Enter a place name or address (or a latitude and longitude).';
        return '';
      }
      if (hasLat !== hasLng) {
        if (!hasLat) errors.lat = 'Add both latitude and longitude, or neither.';
        if (!hasLng) errors.lng = 'Add both latitude and longitude, or neither.';
        return '';
      }
      if (hasLat && hasLng) {
        if (!isLatitude(latRaw)) errors.lat = 'Latitude must be a number between -90 and 90.';
        if (!isLongitude(lngRaw)) errors.lng = 'Longitude must be a number between -180 and 180.';
        if (Object.keys(errors).length) return '';
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        // geo: coordinates with an optional label so map apps show a name too.
        return label
          ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
          : `geo:${lat},${lng}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
    },

    event(values, errors) {
      const title = String(values.title || '').trim();
      if (!title) { errors.title = 'Enter an event name.'; return ''; }
      if (!String(values.start || '').trim()) { errors.start = 'Choose a start date and time.'; return ''; }
      const start = new Date(values.start);
      if (Number.isNaN(start.getTime())) { errors.start = 'That start date is not valid.'; return ''; }
      let end = null;
      if (String(values.end || '').trim()) {
        end = new Date(values.end);
        if (Number.isNaN(end.getTime())) { errors.end = 'That end date is not valid.'; return ''; }
        if (end.getTime() <= start.getTime()) { errors.end = 'The end time must be after the start time.'; return ''; }
      }
      const stamp = icalDate(new Date());
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//QR Studio//QR Studio//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${Date.now()}@qrstudio`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icalDate(start)}`
      ];
      if (end) lines.push(`DTEND:${icalDate(end)}`);
      lines.push(`SUMMARY:${escapeICal(title)}`);
      if (String(values.location || '').trim()) lines.push(`LOCATION:${escapeICal(values.location.trim())}`);
      if (String(values.description || '').trim()) lines.push(`DESCRIPTION:${escapeICal(values.description.trim())}`);
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return lines.join('\r\n');
    }
  };

  const DESCRIBERS = {
    url: v => { const u = normalizeUrl(v.url); try { return u ? new URL(u).hostname.replace(/^www\./, '') : 'Website link'; } catch (e) { return 'Website link'; } },
    text: v => String(v.text || '').trim(),
    email: v => v.to || 'Email',
    phone: v => v.phone || 'Phone',
    whatsapp: v => '+' + digitsOnly(v.cc) + ' ' + digitsOnly(v.phone),
    wifi: v => v.ssid || 'Wi-Fi network',
    vcard: v => [v.firstName, v.lastName].filter(Boolean).join(' ') || 'Contact card',
    sms: v => v.phone || 'SMS',
    location: v => v.label || 'Location',
    event: v => v.title || 'Event'
  };

  /**
   * Build a structured payload for a QR type.
   * @returns {{ok:boolean, payload:string, errors:object, label:string}}
   */
  function build(typeId, values = {}) {
    const type = TYPES_BY_ID[typeId];
    if (!type) return { ok: false, payload: '', errors: { type: 'Unknown QR type.' }, label: '' };
    const builder = BUILDERS[typeId];
    if (!builder) return { ok: false, payload: '', errors: { type: 'This QR type is not implemented.' }, label: '' };

    const errors = {};
    let payload = '';
    try {
      payload = builder(values, errors) || '';
    } catch (error) {
      console.error('[QR Studio] Payload build failed', error);
      return { ok: false, payload: '', errors: { _form: 'Something went wrong building this QR code.' }, label: '' };
    }
    if (Object.keys(errors).length || !payload) {
      return { ok: false, payload: '', errors, label: '' };
    }
    const describer = DESCRIBERS[typeId];
    return { ok: true, payload, errors: {}, label: describer ? describer(values) : payload };
  }

  /* ======================================================================
     4. TEMPLATES
     ====================================================================== */
  const TEMPLATES = [
    {
      id: 'business-website', name: 'Business Website', icon: 'link', type: 'url',
      description: 'Send visitors straight to your homepage.',
      values: { url: 'https://example.com' }
    },
    {
      id: 'instagram', name: 'Instagram Profile', icon: 'grid', type: 'url',
      description: 'Grow your following from a flyer or sticker.',
      values: { url: 'https://instagram.com/yourhandle' }
    },
    {
      id: 'youtube', name: 'YouTube Channel', icon: 'share', type: 'url',
      description: 'Link a video, playlist or your channel.',
      values: { url: 'https://youtube.com/@yourchannel' }
    },
    {
      id: 'whatsapp', name: 'WhatsApp Contact', icon: 'chat', type: 'whatsapp',
      description: 'Open a chat with a pre-filled greeting.',
      values: { cc: '91', phone: '9876543210', message: 'Hi! I found you through your QR code.' }
    },
    {
      id: 'menu', name: 'Restaurant Menu', icon: 'text', type: 'url',
      description: 'Point diners at your digital menu.',
      values: { url: 'https://example.com/menu' }
    },
    {
      id: 'wifi', name: 'Wi-Fi Sharing', icon: 'wifi', type: 'wifi',
      description: 'Guests join your network without typing.',
      values: { ssid: 'CoffeeShop_Guest', password: 'example-password', encryption: 'WPA', hidden: false }
    },
    {
      id: 'vcard', name: 'Digital Business Card', icon: 'user', type: 'vcard',
      description: 'Shareable vCard with your details.',
      values: {
        firstName: 'Ada', lastName: 'Example', org: 'Example Studio', title: 'Designer',
        phone: '+91 98765 43210', email: 'ada@example.com',
        website: 'https://example.com', address: '221B Example Street, Kolkata'
      }
    },
    {
      id: 'event', name: 'Event Registration', icon: 'calendar', type: 'event',
      description: 'One scan adds the event to a calendar.',
      values: {
        title: 'QR Studio Workshop',
        location: 'Kolkata, India',
        start: exampleFutureDate(14, 10),
        end: exampleFutureDate(14, 12),
        description: 'Example event created from a QR Studio template. Replace these details with your own.'
      }
    },
    {
      id: 'maps', name: 'Google Maps Location', icon: 'pin', type: 'location',
      description: 'Open directions with a single scan.',
      values: { label: 'Victoria Memorial, Kolkata', lat: '22.5448', lng: '88.3426' }
    },
    {
      id: 'portfolio', name: 'Portfolio Website', icon: 'sparkles', type: 'url',
      description: 'Show off your work in one scan.',
      values: { url: 'https://example.com/portfolio' }
    }
  ];

  /* ======================================================================
     5. ENCODER
     ====================================================================== */
  const BYTE_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

  function utf8Length(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  /**
   * Encode a payload into a QR matrix at the chosen error correction level.
   * @returns {{moduleCount:number, isDark:function, versionNote:string, bytes:number}}
   */
  function encode(payload, ecc = 'M') {
    if (typeof window.qrcode !== 'function') {
      const error = new Error('The QR encoding library is not available.');
      error.code = 'LIB_MISSING';
      throw error;
    }
    const level = ['L', 'M', 'Q', 'H'].includes(ecc) ? ecc : 'M';
    const bytes = utf8Length(payload);
    if (bytes > BYTE_CAPACITY[level]) {
      const error = new Error(
        `This content is too long for error correction ${level} (${bytes} bytes, limit ${BYTE_CAPACITY[level]}). ` +
        'Shorten the text or lower the error correction level.'
      );
      error.code = 'OVERFLOW';
      throw error;
    }
    try {
      const qr = window.qrcode(0, level);
      qr.addData(payload, 'Byte');
      qr.make();
      const moduleCount = qr.getModuleCount();
      return {
        moduleCount,
        isDark: (row, col) => qr.isDark(row, col),
        bytes,
        ecc: level,
        capacity: BYTE_CAPACITY[level]
      };
    } catch (error) {
      const overflow = new Error(
        'This content is too large to fit in a QR code at the selected error correction level. ' +
        'Shorten the text or lower the error correction level.'
      );
      overflow.code = 'OVERFLOW';
      overflow.cause = error;
      throw overflow;
    }
  }

  /* ======================================================================
     6. GEOMETRY HELPERS (unit space = one QR module)
     ====================================================================== */
  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  /** Rounded-rectangle path with per-corner radii: [tl, tr, br, bl]. */
  function roundedRectPath(x, y, w, h, radii) {
    const list = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    const limit = Math.min(w, h) / 2;
    const [tl, tr, br, bl] = list.map(r => clamp(Number(r) || 0, 0, limit));
    let d = `M${round(x + tl)} ${round(y)}`;
    d += `H${round(x + w - tr)}`;
    if (tr > 0) d += `A${round(tr)} ${round(tr)} 0 0 1 ${round(x + w)} ${round(y + tr)}`;
    d += `V${round(y + h - br)}`;
    if (br > 0) d += `A${round(br)} ${round(br)} 0 0 1 ${round(x + w - br)} ${round(y + h)}`;
    d += `H${round(x + bl)}`;
    if (bl > 0) d += `A${round(bl)} ${round(bl)} 0 0 1 ${round(x)} ${round(y + h - bl)}`;
    d += `V${round(y + tl)}`;
    if (tl > 0) d += `A${round(tl)} ${round(tl)} 0 0 1 ${round(x + tl)} ${round(y)}`;
    return d + 'Z';
  }

  function circlePath(cx, cy, r) {
    return `M${round(cx - r)} ${round(cy)}a${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0a${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0Z`;
  }

  const EYE_STYLES = {
    square: { outer: 0, hole: 0, dot: 0 },
    rounded: { outer: 1.9, hole: 1.35, dot: 0.8 },
    circle: { outer: 3.5, hole: 2.5, dot: 1.5 },
    leaf: { outer: [3.1, 0.4, 3.1, 0.4], hole: [1.7, 0.2, 1.7, 0.2], dot: [0.9, 0.15, 0.9, 0.15] }
  };

  function isEyeModule(row, col, n) {
    const inTopLeft = row < 7 && col < 7;
    const inTopRight = row < 7 && col >= n - 7;
    const inBottomLeft = row >= n - 7 && col < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  }

  /** Logo geometry in module units, based on percentage of the code area. */
  function logoGeometry(moduleCount, margin, logo) {
    const total = moduleCount + margin * 2;
    if (!logo || !logo.dataUrl) return null;
    const size = clamp(Number(logo.size) || 22, 8, 40);
    const padding = clamp(Number(logo.padding) || 0, 0, 60);
    const side = moduleCount * (size / 100);
    const bgSide = Math.min(side * (1 + (padding / 100) * 2), total * 0.62);
    return {
      total,
      x: (total - bgSide) / 2,
      y: (total - bgSide) / 2,
      bgSide,
      side: Math.min(side, bgSide),
      radius: logo.round === false ? 0 : Math.min(bgSide * 0.24, side * 0.34),
      logo
    };
  }

  function buildModulePaths(matrix, margin, moduleStyle, logoGeom) {
    const n = matrix.moduleCount;
    const paths = [];
    const insideLogo = (cx, cy) => logoGeom &&
      cx > logoGeom.x && cx < logoGeom.x + logoGeom.bgSide &&
      cy > logoGeom.y && cy < logoGeom.y + logoGeom.bgSide;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!matrix.isDark(row, col)) continue;
        if (isEyeModule(row, col, n)) continue;
        const x = margin + col;
        const y = margin + row;
        if (insideLogo(x + 0.5, y + 0.5)) continue;

        if (moduleStyle === 'dots') {
          paths.push(circlePath(x + 0.5, y + 0.5, 0.42));
        } else if (moduleStyle === 'rounded') {
          paths.push(roundedRectPath(x + 0.02, y + 0.02, 0.96, 0.96, 0.34));
        } else {
          paths.push(roundedRectPath(x, y, 1, 1, 0));
        }
      }
    }
    return paths.join(' ');
  }

  function buildEyePaths(matrix, margin, eyeStyle) {
    const n = matrix.moduleCount;
    const style = EYE_STYLES[eyeStyle] ? EYE_STYLES[eyeStyle] : EYE_STYLES.square;
    const positions = [
      [margin, margin],
      [margin + n - 7, margin],
      [margin, margin + n - 7]
    ];
    return positions.map(([x, y]) => (
      roundedRectPath(x, y, 7, 7, style.outer) +
      roundedRectPath(x + 1, y + 1, 5, 5, style.hole) +
      roundedRectPath(x + 2, y + 2, 3, 3, style.dot)
    )).join(' ');
  }

  function eyeColorFor(design) {
    return design.eyeColorEnabled && normalizeHex(design.eyeColor) ? normalizeHex(design.eyeColor) : normalizeHex(design.fg);
  }

  function safeHex(value, fallback) {
    const normal = normalizeHex(value);
    return normal || fallback;
  }

  /* ======================================================================
     7. SVG RENDERER
     ====================================================================== */
  function renderSVG({ matrix, design, size = 0, width = 0, height = 0, includeQuiet = true, transparent = false, title = 'QR code' }) {
    if (!matrix) throw new Error('No QR matrix to render.');
    const fg = safeHex(design.fg, '#0B1512');
    const bg = safeHex(design.bg, '#FFFFFF');
    const eyeColor = eyeColorFor(design);
    const margin = includeQuiet ? clamp(Number(design.margin) || 0, 0, 10) : 0;
    const n = matrix.moduleCount;
    const total = n + margin * 2;
    const isTransparent = Boolean(transparent || design.transparent);
    const logoGeom = logoGeometry(n, margin, design.logo);

    const modulePath = buildModulePaths(matrix, margin, design.moduleStyle, logoGeom);
    const eyePath = buildEyePaths(matrix, margin, design.eyeStyle);
    const crisp = design.moduleStyle === 'square' && design.eyeStyle === 'square';
    const outW = width > 0 ? Math.round(width) : (size > 0 ? Math.round(size) : 0);
    const outH = height > 0 ? Math.round(height) : outW;
    const dimension = outW > 0 ? ` width="${outW}" height="${outH}"` : '';

    let markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dimension} ` +
      `role="img" aria-label="${title}" preserveAspectRatio="xMidYMid meet" ` +
      `shape-rendering="${crisp ? 'crispEdges' : 'geometricPrecision'}">`;

    if (!isTransparent) {
      markup += `<rect width="${total}" height="${total}" fill="${bg}"/>`;
    }

    if (logoGeom) {
      markup += `<rect x="${round(logoGeom.x)}" y="${round(logoGeom.y)}" width="${round(logoGeom.bgSide)}" ` +
        `height="${round(logoGeom.bgSide)}" rx="${round(logoGeom.radius)}" fill="${safeHex(logoGeom.logo.bg, '#FFFFFF')}"/>`;
    }

    if (modulePath) markup += `<path d="${modulePath}" fill="${fg}"/>`;
    if (eyePath) markup += `<path d="${eyePath}" fill="${eyeColor}" fill-rule="evenodd"/>`;

    if (logoGeom && logoGeom.logo.dataUrl) {
      const side = logoGeom.side;
      const x = (logoGeom.total - side) / 2;
      const y = (logoGeom.total - side) / 2;
      const href = String(logoGeom.logo.dataUrl).replace(/"/g, '%22').replace(/\s+/g, '');
      markup += `<image href="${href}" x="${round(x)}" y="${round(y)}" ` +
        `width="${round(side)}" height="${round(side)}" preserveAspectRatio="xMidYMid meet"/>`;
    }

    markup += '</svg>';
    return markup;
  }

  /* ======================================================================
     8. CANVAS RENDERER
     ====================================================================== */
  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The logo image could not be read.'));
      image.src = dataUrl;
    });
  }

  /**
   * Draw the QR code onto a canvas element.
   * @returns {HTMLCanvasElement}
   */
  function renderCanvas(canvas, { matrix, design, width, height, includeQuiet = true, transparent = false, logoImage = null }) {
    if (!matrix) throw new Error('No QR matrix to render.');
    if (typeof Path2D === 'undefined') throw new Error('This browser cannot render QR exports. Please update your browser.');

    const fg = safeHex(design.fg, '#0B1512');
    const bg = safeHex(design.bg, '#FFFFFF');
    const eyeColor = eyeColorFor(design);
    const margin = includeQuiet ? clamp(Number(design.margin) || 0, 0, 10) : 0;
    const n = matrix.moduleCount;
    const total = n + margin * 2;

    const w = Math.max(64, Math.round(width));
    const h = Math.max(64, Math.round(height));
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / total, 0, 0, h / total, 0, 0);

    const isTransparent = Boolean(transparent || design.transparent);
    if (!isTransparent) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, total, total);
    }

    const logoGeom = logoGeometry(n, margin, design.logo);

    if (logoGeom) {
      ctx.fillStyle = safeHex(logoGeom.logo.bg, '#FFFFFF');
      ctx.fill(new Path2D(roundedRectPath(logoGeom.x, logoGeom.y, logoGeom.bgSide, logoGeom.bgSide, logoGeom.radius)));
    }

    const modulePath = buildModulePaths(matrix, margin, design.moduleStyle, logoGeom);
    if (modulePath) {
      ctx.fillStyle = fg;
      ctx.fill(new Path2D(modulePath));
    }

    const eyePath = buildEyePaths(matrix, margin, design.eyeStyle);
    if (eyePath) {
      ctx.fillStyle = eyeColor;
      ctx.fill(new Path2D(eyePath), 'evenodd');
    }

    if (logoGeom && logoImage && logoImage.complete && logoImage.naturalWidth) {
      const side = logoGeom.side;
      const x = (logoGeom.total - side) / 2;
      const y = (logoGeom.total - side) / 2;
      const ratio = Math.min(side / logoImage.naturalWidth, side / logoImage.naturalHeight);
      const drawW = logoImage.naturalWidth * ratio;
      const drawH = logoImage.naturalHeight * ratio;
      ctx.drawImage(logoImage, x + (side - drawW) / 2, y + (side - drawH) / 2, drawW, drawH);
    }

    return canvas;
  }

  /* ======================================================================
     9. SCAN-SAFETY ANALYSIS
     ====================================================================== */
  const { contrastRatio, isInverted } = window.QRS_UTIL;

  function analyze({ matrix, design, includeQuiet = true }) {
    const notes = [];
    if (!matrix) return notes;

    const fg = safeHex(design.fg, '#0B1512');
    // A transparent background is judged against white: that is what a scanner
    // would see on paper or on most screens.
    const bg = design.transparent ? '#FFFFFF' : safeHex(design.bg, '#FFFFFF');
    const ratio = contrastRatio(fg, bg);

    if (ratio < 2) {
      notes.push({ level: 'danger', text: `Contrast is only ${ratio.toFixed(1)}:1. Most scanners will fail — choose a much darker foreground or lighter background.` });
    } else if (ratio < 4.5) {
      notes.push({ level: 'warn', text: `Contrast is ${ratio.toFixed(1)}:1. It may scan, but 4.5:1 or higher is safer for prints and older phones.` });
    }

    if (isInverted(fg, bg) && !design.transparent) {
      notes.push({ level: 'warn', text: 'Light modules on a dark background (inverted QR) are rejected by some scanning apps. Test before publishing.' });
    }

    if (design.transparent) {
      notes.push({ level: 'warn', text: 'A transparent background has no guaranteed contrast. Place the code on a light surface before scanning or printing.' });
    }

    if (design.logo && design.logo.dataUrl) {
      const margin = includeQuiet ? clamp(Number(design.margin) || 0, 0, 10) : 0;
      const geom = logoGeometry(matrix.moduleCount, margin, design.logo);
      // Coverage is measured against the code itself (not the quiet zone).
      const coverage = geom ? Math.pow((geom.bgSide / matrix.moduleCount) * 100, 2) : 0;
      if (coverage > 20) {
        notes.push({ level: 'danger', text: `The logo covers about ${coverage.toFixed(0)}% of the QR area — scanning is likely to fail. Shrink the logo or its padding.` });
      } else if (coverage > 12) {
        notes.push({ level: 'warn', text: `The logo covers about ${coverage.toFixed(0)}% of the QR area. Keep it under 12% (roughly 30% of the width) and test before publishing.` });
      }
      if (design.ecc !== 'Q' && design.ecc !== 'H') {
        notes.push({ level: 'warn', text: 'You added a logo. Switch error correction to Q or H so scanners can rebuild the covered modules.' });
      }
    }

    const margin = includeQuiet ? Number(design.margin) || 0 : 0;
    if (margin < 2) {
      notes.push({ level: 'warn', text: 'The quiet zone is very small. Use at least 2 modules (4 is the standard) so cameras can find the code.' });
    }

    if (design.ecc === 'L') {
      notes.push({ level: 'warn', text: 'Error correction L recovers only about 7% of the code. M or higher is safer for real-world use.' });
    }

    if (matrix.bytes && matrix.capacity && matrix.bytes > matrix.capacity * 0.9) {
      notes.push({ level: 'warn', text: 'This content is close to the size limit for the selected error correction level. Consider shortening it or using a lower level.' });
    }

    return notes;
  }

  return {
    QR_TYPES,
    TYPES_BY_ID,
    TEMPLATES,
    build,
    encode,
    renderSVG,
    renderCanvas,
    analyze,
    logoGeometry,
    eyeColorFor,
    loadImage,
    ensureLibrary,
    isReady,
    byteCapacity: BYTE_CAPACITY
  };
})();

window.QRS_QR = QRS_QR;
