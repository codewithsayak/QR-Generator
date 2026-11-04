/* ==========================================================================
   QR Studio — js/export.js
   Real file export (PNG / SVG / JPEG), clipboard image copy and Web Share.
   Everything is rendered from the live QR matrix and the exact design state —
   there are no placeholder or pre-baked images anywhere in this file.
   ========================================================================== */

const QRS_EXPORT = (function () {
  'use strict';

  const { downloadBlob, safeFileName, clamp } = window.QRS_UTIL;
  const LIMITS = (window.QRS_CONFIG && QRS_CONFIG.limits) || {};
  const MAX_PX = LIMITS.maxExportPx || 4096;
  const MIN_PX = 128;

  const FORMATS = {
    png: { mime: 'image/png', extension: 'png', label: 'PNG' },
    jpeg: { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' },
    svg: { mime: 'image/svg+xml', extension: 'svg', label: 'SVG' }
  };

  function clampSize(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 0;
    return clamp(n, MIN_PX, MAX_PX);
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('The browser could not encode this image.'));
        }, mime, quality);
      } else {
        // Very old browsers: data URL fallback.
        try {
          const dataUrl = canvas.toDataURL(mime, quality);
          const parts = dataUrl.split(',');
          const byteString = atob(parts[1]);
          const buffer = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) buffer[i] = byteString.charCodeAt(i);
          resolve(new Blob([buffer], { type: mime }));
        } catch (error) {
          reject(new Error('This browser cannot export canvas images.'));
        }
      }
    });
  }

  /**
   * Render the QR to an offscreen canvas, keeping it square so the code can
   * never be distorted, and pad to the requested canvas size when custom
   * non-square dimensions are chosen.
   */
  function renderToCanvas({ matrix, design, width, height, includeQuiet, transparent, logoImage }) {
    const targetW = clampSize(width) || 1024;
    const targetH = clampSize(height) || targetW;
    const side = Math.min(targetW, targetH);
    const isTransparent = Boolean(transparent);

    const square = document.createElement('canvas');
    window.QRS_QR.renderCanvas(square, {
      matrix,
      design,
      width: side,
      height: side,
      includeQuiet,
      transparent: isTransparent,
      logoImage
    });

    if (targetW === side && targetH === side) return square;

    const padded = document.createElement('canvas');
    padded.width = targetW;
    padded.height = targetH;
    const ctx = padded.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    if (!isTransparent) {
      ctx.fillStyle = normalizeOr(design.bg, '#FFFFFF');
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(square, Math.round((targetW - side) / 2), Math.round((targetH - side) / 2));
    return padded;
  }

  function normalizeOr(value, fallback) {
    return window.QRS_UTIL.normalizeHex(value) || fallback;
  }

  function buildFileName(base, format, width, height) {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = safeFileName(base || 'qr-studio', 'qr-studio');
    const sizePart = width === height ? `${width}px` : `${width}x${height}px`;
    return `${name}-${sizePart}-${stamp}.${FORMATS[format].extension}`;
  }

  /**
   * Build an export artefact without triggering a download.
   * @returns {Promise<{blob:Blob, filename:string, width:number, height:number, format:string}>}
   */
  async function build({ format = 'png', matrix, design, width, height, includeQuiet = true, quality = 0.92, logoImage = null, baseName = 'qr-studio' }) {
    if (!matrix) throw new Error('Generate a QR code before exporting.');
    const targetW = clampSize(width) || 1024;
    const targetH = clampSize(height) || targetW;
    const kind = FORMATS[format] ? format : 'png';

    if (kind === 'svg') {
      const markup = window.QRS_QR.renderSVG({
        matrix,
        design,
        width: targetW,
        height: targetH,
        includeQuiet,
        transparent: Boolean(design.transparent),
        title: 'QR code created with QR Studio'
      });
      const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], { type: FORMATS.svg.mime });
      return { blob, filename: buildFileName(baseName, 'svg', targetW, targetH), width: targetW, height: targetH, format: 'svg' };
    }

    // JPEG has no alpha channel: always paint the chosen background color.
    const transparent = kind === 'png' && Boolean(design.transparent);
    const canvas = renderToCanvas({
      matrix,
      design: kind === 'jpeg' ? { ...design, transparent: false } : design,
      width: targetW,
      height: targetH,
      includeQuiet,
      transparent,
      logoImage
    });
    const blob = await canvasToBlob(canvas, FORMATS[kind].mime, kind === 'jpeg' ? clamp(Number(quality) || 92, 50, 100) / 100 : undefined);
    return { blob, filename: buildFileName(baseName, kind, targetW, targetH), width: targetW, height: targetH, format: kind };
  }

  /** Build + download. */
  async function download(options) {
    const result = await build(options);
    downloadBlob(result.blob, result.filename);
    return result;
  }

  /** PNG blob at 1024px for clipboard / share. */
  async function buildPng({ matrix, design, width = 1024, includeQuiet = true, logoImage = null }) {
    return build({
      format: 'png',
      matrix,
      design,
      width,
      height: width,
      includeQuiet,
      logoImage
    });
  }

  function canCopyImage() {
    return Boolean(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext);
  }

  async function copyImage(options) {
    if (!canCopyImage()) {
      throw new Error('Copying images to the clipboard is not supported in this browser. Use Download instead.');
    }
    const { blob } = await buildPng(options);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([new Blob(['x'], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
      return navigator.canShare({ files: [probe] });
    } catch (error) {
      return false;
    }
  }

  const canShareText = () => typeof navigator.share === 'function';

  /**
   * Share the QR image with the Web Share API. Falls back to sharing the text
   * payload, and reports what happened so the UI can guide the user.
   * @returns {Promise<'files'|'text'>}
   */
  async function share({ matrix, design, payload, includeQuiet = true, logoImage = null, title = 'QR Studio', text = '' }) {
    if (canShareFiles()) {
      const { blob, filename } = await buildPng({ matrix, design, width: 1024, includeQuiet, logoImage });
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({ files: [file], title, text: text || 'QR code created with QR Studio' });
      return 'files';
    }
    if (canShareText()) {
      await navigator.share({ title, text: text || payload || 'QR code created with QR Studio' });
      return 'text';
    }
    throw new Error('Sharing is not available in this browser. Copy the content instead.');
  }

  return {
    FORMATS, MAX_PX, MIN_PX,
    build, download, buildPng, copyImage, share,
    canCopyImage, canShareFiles, canShareText, clampSize
  };
})();

window.QRS_EXPORT = QRS_EXPORT;
