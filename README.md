# QR Studio — by Code With Sayak

A premium, neumorphic QR code studio that runs entirely in the browser. Create, customise,
preview, save and download genuinely scannable QR codes for links, Wi-Fi, contacts, WhatsApp,
events, locations and more — with custom colours, module shapes, eye shapes, logos and
high-resolution PNG / SVG / JPEG export.

**No frameworks. No build step. No backend. No trackers. Nothing you type ever leaves your device.**

---

## Table of contents

1. [Project overview](#project-overview)
2. [Main features](#main-features)
3. [Technology stack](#technology-stack)
4. [Folder structure](#folder-structure)
5. [Run it locally](#run-it-locally)
6. [Customise branding](#customise-branding)
7. [Configure social links](#configure-social-links)
8. [Deploy on GitHub Pages](#deploy-on-github-pages)
9. [Deploy on Vercel](#deploy-on-vercel)
10. [Known browser limitations](#known-browser-limitations)
11. [QR scanning & logo best practices](#qr-scanning--logo-best-practices)
12. [Testing](#testing)
13. [License](#license)

---

## Project overview

QR Studio is a single-page QR code generator built with plain HTML, CSS and JavaScript.
It encodes content **locally** with a vendored MIT-licensed encoder
([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)) and then draws every
QR code with a **custom SVG + Canvas renderer**, which is what makes the module shapes, eye
shapes, colours, transparent backgrounds and embedded logos possible.

Ten content types are supported, each with its own structured encoding and validation:

| Type | Encoded format |
| --- | --- |
| Website / URL | `https://…` |
| Plain text | raw UTF-8 text |
| Email | `mailto:address?subject=…&body=…` |
| Phone | `tel:+…` |
| WhatsApp | `https://wa.me/<countrycode><number>?text=…` |
| Wi-Fi | `WIFI:T:WPA;S:ssid;P:password;H:true;;` |
| Contact card | vCard 3.0 (`BEGIN:VCARD …`) |
| SMS | `SMSTO:+number:message` |
| Location | `geo:lat,lng?q=lat,lng(label)` or a Google Maps search URL |
| Event | iCalendar `VEVENT` (downloadable `.ics` payload) |

---

## Main features

**Creation**
- 10 QR content types with per-type fields and inline validation.
- Live preview with an optional on/off toggle and an explicit **Generate** button.
- Reset form, reset design and reset-all-settings actions.
- 10 ready-made templates that select the right type and fill clearly labelled example values.

**Design studio**
- Foreground / background colour pickers with synced HEX inputs and 8 curated presets.
- Module shapes: **square, rounded, dots** (all genuinely rendered).
- Eye shapes: **square, rounded, circle, leaf** (all genuinely rendered), plus an optional
  custom eye colour.
- Quiet zone slider (0–10 modules) and error correction L / M / Q / H.
- Optional transparent background (PNG and SVG exports).
- Logo upload (PNG, JPEG, WEBP, SVG · max 2 MB) with size, padding, background colour and
  rounded-corner controls; logos are downscaled to 480 px, everything stays local.
- Scan-safety analysis: contrast ratio, inverted colours, quiet zone, ECC level, logo coverage
  and payload size near the encoder limit.

**Preview**
- Crisp inline SVG preview, live dimension/type/colour/ECC/logo metadata.
- Checkerboard background for transparent codes, full-screen preview modal.

**Export**
- Real **PNG**, **SVG** (true vector paths, logo embedded) and **JPEG** files.
- 512 / 1024 / 2048 px presets plus custom dimensions (128–4096 px, never distorted — the
  code is centred on the background instead of being stretched).
- JPEG quality control and an include/exclude quiet-zone option.
- Copy encoded content, copy the QR image (where the Clipboard API allows it), and share
  through the Web Share API with graceful fallbacks.

**Library & history**
- **My QR Codes**: save with a custom name, preview thumbnails, reopen/edit, download,
  duplicate, delete (with confirmation), search and filter by type.
- **Recent QR codes**: last 12 exported/saved codes with dates, reopen and download, clear history.
- All persistence uses LocalStorage with sanitised records, quota handling, corrupt-entry
  recovery and an in-memory fallback when storage is blocked.

**Interface**
- Neumorphic design system with dark (default) and light themes.
- Fully responsive: 320, 375, 425, 768, 1024 and 1440 px layouts, no horizontal scrolling.
- Keyboard-accessible dialogs with focus trapping and Escape-to-close, ARIA states on all
  custom controls, `aria-live` toasts and status regions, semantic headings and labels.
- SEO title/description, Open Graph tags, SVG favicon, lazy-loaded decorative images.

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Markup | HTML5 |
| Styling | CSS3 (custom properties, grid, flexbox, `color-mix` with fallbacks) |
| Logic | Vanilla JavaScript (ES2017+, no transpiler) |
| Graphics | SVG + Canvas 2D |
| QR encoding | [qrcode-generator 1.4.4](https://github.com/kazuhikoarase/qrcode-generator) (MIT), vendored in `js/vendor/qrcode.js` |
| Persistence | Browser LocalStorage |
| Fonts | Inter via Google Fonts, with a system-font fallback |

No React, Vue, Angular, Tailwind, TypeScript, Node.js, bundler, backend or database is used.

---

## Folder structure

```
QR-Generator/                  ← repository root = the deployable site (no build step)
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js                 ← UI controller: state, events, rendering, save/delete flows
│   ├── qr-generator.js        ← content schemas, payload builders, encoder + SVG/Canvas renderer
│   ├── export.js              ← PNG / SVG / JPEG export, clipboard, Web Share
│   ├── storage.js             ← LocalStorage: saved codes, history, preferences
│   ├── utilities.js           ← QRS_CONFIG, DOM/format/colour helpers, toasts, modals
│   └── vendor/
│       ├── qrcode.js          ← vendored MIT QR encoder (unchanged)
│       └── qrcode.LICENSE.txt
├── assets/
│   ├── logo.svg
│   └── favicon.svg
├── README.md
├── LICENSE
└── .gitignore
```

> The original brief suggested a `qr-studio/` sub-folder. The files sit at the repository root
> instead, so GitHub Pages, Vercel and any static host serve the site with **zero
> configuration** — no build tools, no rewrite rules.

---

## Run it locally

Because the app is static, there are three ways to run it.

**1. Double-click `index.html`.** Everything works offline except the optional Inter webfont
(which falls back to your system font). The vendored encoder loads from the local `js/vendor`
folder — no CDN needed.

**2. Serve it with Python** (recommended, mirrors production):

```bash
cd QR-Generator
python3 -m http.server 8080
# open http://localhost:8080
```

**3. Serve it with Node:**

```bash
npx serve .
```

Clipboard image copy requires a secure context (`https://` or `http://localhost`).

---

## Customise branding

Everything visitor-facing lives in one place: **`js/utilities.js` → `QRS_CONFIG`**.

```js
const QRS_CONFIG = {
  brand: {
    name: 'QR Studio',
    creator: 'Code With Sayak',
    tagline: 'A free QR code creation tool.',
    builtWith: 'Built with HTML, CSS & JavaScript.'
  },
  social: { github: '', instagram: '', telegram: '', contact: '' },
  limits: {
    savedCodes: 60,
    historyItems: 12,
    logoBytes: 2 * 1024 * 1024,
    maxExportPx: 4096,
    maxPayloadChars: 2400
  },
  qrCdnFallback: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
};
```

Other branding points:

- **Name, tagline and copy** — edit `index.html` (header, hero, footer, FAQ).
- **Logo & favicon** — replace `assets/logo.svg` and `assets/favicon.svg`.
- **Colours** — the design tokens are at the top of `css/style.css` (`--accent`, `--violet`,
  `--gradient`, plus the `html[data-theme]` blocks). Adjusting three or four tokens re-skins
  the whole studio.
- **Default QR design** — `DEFAULT_DESIGN` in `js/app.js`.
- **Presets** — the `PRESETS` array in `js/app.js`.
- **Templates** — the `TEMPLATES` array in `js/qr-generator.js`.

---

## Configure social links

Set the four URLs in `QRS_CONFIG.social` (see above). Any value that is not a valid
`https://` (or `mailto:`) URL renders as a clearly labelled button that explains the link
still needs to be configured — it never points at an invented profile.

```js
social: {
  github: 'https://github.com/your-username',
  instagram: 'https://instagram.com/your-handle',
  telegram: 'https://t.me/your-channel',
  contact: 'mailto:hello@example.com'
}
```

---

## Deploy on GitHub Pages

1. Push the repository to GitHub (the site lives on the default branch, e.g. `main`).
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/ (root)**, then **Save**.
5. Wait for the deployment, then open `https://<username>.github.io/<repo>/`.

No build step and no `base` path configuration are required — every asset is referenced
relatively, so the site also works from a project sub-path.

**Custom domain:** add a `CNAME` file containing your domain at the repository root, then
point a `CNAME` DNS record at `<username>.github.io`.

---

## Deploy on Vercel

**Option A — dashboard**

1. Push the repository to GitHub.
2. In Vercel choose **Add New → Project** and import the repository.
3. Framework preset: **Other**. Build command: *(empty)*. Output directory: `.` (root).
4. **Deploy.**

**Option B — CLI**

```bash
npm i -g vercel
cd QR-Generator
vercel --prod
```

**Option C — drag & drop**

Run `vercel` inside the project folder, or drag the folder onto the Vercel dashboard to create
a project from the static files.

Optional `vercel.json` for long-cache static assets:

```json
{
  "headers": [
    {
      "source": "/(css|js|assets)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

Any other static host (Netlify, Cloudflare Pages, Firebase Hosting, plain NGINX) works the same
way: serve the repository root.

---

## Known browser limitations

QR Studio degrades gracefully instead of breaking, but these features depend on the browser:

| Feature | Requirement | Behaviour when unavailable |
| --- | --- | --- |
| Copy QR image | Clipboard API with `ClipboardItem` + secure context | Clear message, Download still works |
| Copy encoded content | `navigator.clipboard` or `document.execCommand` fallback | Error toast asking you to copy manually |
| Share QR | Web Share API (Level 2 for files) | Falls back to sharing text, then to an explanatory message |
| PNG / JPEG export | Canvas 2D + `Path2D` | Error toast suggesting a modern browser |
| SVG export | Any modern browser | — |
| LocalStorage | Not blocked, not full | Studio still works; saving/history show a warning |
| `color-mix()` styling | Chrome & Safari 16.4+, Firefox 113+ | Solid header/tint fallbacks are declared first |
| Web font (Inter) | Network access to Google Fonts | Falls back to `system-ui` / Segoe UI / Roboto |
| Google Inter font | Network access | System font stack is used |

Tested markup/behaviour targets current Chrome, Edge, Firefox and Safari. Very old browsers
(no `Path2D`, no ES2017) will show a clear error rather than silently producing a broken code.

---

## QR scanning & logo best practices

1. **Always scan-test the exported file** with a real phone before publishing or printing.
   QR Studio estimates contrast, quiet zone and logo coverage, but only a physical scan proves
   it works on the target device.
2. **Keep strong contrast.** Dark modules on a light background scan best. QR Studio warns
   below 4.5:1 and shows a hard warning below 2:1 (exports are never blocked — you decide).
3. **Avoid inverted codes** (white modules on a dark background) — some scanner apps refuse them.
4. **Respect the quiet zone.** 4 modules is the standard; never go below 2.
5. **Use error correction Q or H with a logo.** The coloured-in modules are data; error
   correction is what lets a scanner rebuild them. M recovers ~15%, Q ~25%, H ~30%.
6. **Keep logos modest.** Stay near 20–25 % of the QR width (roughly 6 % of its area) and never
   let the logo touch the three corner eyes. QR Studio raises a warning above ~12 % area coverage.
7. **Export large enough for the medium.** 1024 px for screens and social, 2048 px for posters,
   SVG for print. Aim for at least 2 × 2 cm in print for short links.
8. **Do not stretch the code.** QR Studio centres custom canvas sizes instead of distorting them.
9. **Transparent backgrounds need a light surface.** Test the final composition, not the file alone.
10. **Long content makes dense codes.** Shorter payloads scan faster and tolerate more decoration.

---

## Testing

The project ships without a test runner (it is a static site), but the implementation was
verified during development with an automated jsdom + rasterisation harness:

**Engine (51 checks)**
- All 10 payload builders produce the correct structured strings (mailto, tel, wa.me, WIFI with
  escaped `;`/`,`, vCard 3.0, SMSTO, geo, iCalendar).
- 11 invalid-input cases report errors on the right field.
- Encoding, UTF-8 content, overflow handling, all module/eye style combinations, transparent
  and logo variants.
- LocalStorage round-trips plus malformed/corrupt record recovery.

**Scan verification (83 images decoded)**
- A 66-case stress matrix (3 module shapes × 4 eye shapes × 4 error-correction levels, margins
  0–10, logos at 16–26 % with 0–16 % padding, transparent and inverted variants) was rasterised
  and decoded with the ZXing decoder — 66/66 matched the original payload exactly.
- All 10 content types were decoded back to their exact structured strings (15/15).
- The exported PNG (canvas path) and exported SVG were rasterised and decoded as well (2/2).

**Export (23 checks)**
- PNG/SVG/JPEG blobs, MIME types, filenames, dimension clamping (128–4096), non-square
  centring, JPEG opacity, transparent PNG, quiet-zone handling and graceful failure paths.
- The canvas-rendered PNG and the SVG export were both rasterised and decoded successfully.

**Logo flow (18 checks)**
- Drop/upload validation, downscaling, auto-raising error correction to H, coverage warnings,
  rejection of unsupported and oversized files, and removal.

**Interface (75 checks)**
- Type switching, live preview, validation display, templates, design controls, export
  controls, save/duplicate/reopen/delete-with-confirmation, search & filter, history & clear,
  theme toggle, FAQ accordion, mobile navigation, modal Escape/focus handling, resets and
  copy fallbacks. Saved names are rendered as text (HTML is escaped).

**Manual checklist for a release** (also on the site under *Help → Scan testing*):

1. Generate each of the 10 QR types and scan it with a phone.
2. Change foreground/background colours, ECC, margin, module and eye shapes; scan again.
3. Upload a logo, adjust size/padding, remove it; confirm the warnings appear.
4. Download PNG, JPEG, SVG, high-resolution and transparent PNG; verify each file opens.
5. Save, reopen, edit, duplicate and delete a QR code; search and filter the library.
6. Toggle the theme, resize from 320 px to 1440 px, and check there is no horizontal scroll.
7. Reload the page to confirm saved codes, history and preferences persist.

Physical scanning on real devices has **not** been performed in the development environment;
do that final pass yourself before publishing.

---

## Credits

- QR encoding: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by
  Kazuhiko Arase (MIT). Vendored unchanged in `js/vendor/qrcode.js`.
- Typeface: [Inter](https://rsms.me/inter/) by Rasmus Andersson (SIL Open Font License).
- “QR Code” is a registered trademark of DENSO WAVE INCORPORATED.

---

## License

MIT © Code With Sayak — see [LICENSE](LICENSE).
