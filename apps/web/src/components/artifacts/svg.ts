/**
 * SVG sanitization and PNG rasterization (§12.7, design decision 8).
 *
 * `sanitizeSvg` runs DOMPurify with its SVG profile before the markup is ever
 * inlined, so scripts and event handlers are stripped. `svgToPngDataUrl`
 * rasterizes the sanitized SVG through a canvas + Image, with a size cap so an
 * enormous diagram cannot exhaust the canvas (a clear error surfaces instead).
 */

import DOMPurify from "dompurify";

/** Largest canvas dimension the PNG export will produce (pixels). */
export const PNG_MAX_DIMENSION = 4096;

/**
 * Sanitize raw SVG markup with DOMPurify's SVG profile. Returns sanitized
 * markup safe to inline via `dangerouslySetInnerHTML`.
 */
export function sanitizeSvg(source: string): string {
  return DOMPurify.sanitize(source, {
    // SVG profile + filters: keeps SVG elements/attributes, drops everything
    // DOMPurify's allowlist does not permit (scripts, event handlers, etc.).
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

/** Parsed dimensions of an SVG document (px), for the PNG raster size. */
export interface SvgDimensions {
  width: number;
  height: number;
}

const DEFAULT_SVG_SIZE = 800;

/** Parse a numeric CSS length, defaulting to `fallback` for non-numeric text. */
function numericLength(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const match = /^([\d.]+)/.exec(value.trim());
  if (match === null || match[1] === undefined) return fallback;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Read the width/height of an SVG, from its `width`/`height` attributes and
 * falling back to its `viewBox`. Uses DOMParser so the values come from the
 * real markup rather than a regex guess.
 */
export function svgDimensions(markup: string): SvgDimensions {
  const documentNode = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = documentNode.documentElement;
  if (svg === null || svg.tagName.toLowerCase() !== "svg") {
    return { width: DEFAULT_SVG_SIZE, height: DEFAULT_SVG_SIZE };
  }

  const width = numericLength(svg.getAttribute("width"), 0);
  const height = numericLength(svg.getAttribute("height"), 0);

  const viewBox = svg.getAttribute("viewBox");
  if (width > 0 && height > 0) return { width, height };
  if (viewBox !== null) {
    const parts = viewBox.trim().split(/[\s,]+/);
    const vbWidth = Number(parts[2]);
    const vbHeight = Number(parts[3]);
    if (
      Number.isFinite(vbWidth) &&
      Number.isFinite(vbHeight) &&
      vbWidth > 0 &&
      vbHeight > 0
    ) {
      return { width: width > 0 ? width : vbWidth, height: height > 0 ? height : vbHeight };
    }
  }
  return {
    width: width > 0 ? width : DEFAULT_SVG_SIZE,
    height: height > 0 ? height : DEFAULT_SVG_SIZE,
  };
}

/** Serialize an SVG node to markup (the XML declaration is not needed inline). */
function serializeSvg(svg: Element): string {
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Rasterize sanitized SVG markup to a PNG data URL.
 *
 * The SVG is re-parsed, given explicit pixel dimensions (clamped to
 * {@link PNG_MAX_DIMENSION}), serialized to a data URL, loaded through an
 * `Image`, and drawn onto a canvas. The object URL is revoked on both success
 * and failure.
 */
export function svgToPngDataUrl(
  markup: string,
  maxDimension: number = PNG_MAX_DIMENSION,
): Promise<string> {
  const { width, height } = svgDimensions(markup);
  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  // Force the intrinsic size so the Image decodes at the clamped dimensions.
  const documentNode = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = documentNode.documentElement;
  if (svg !== null) {
    svg.setAttribute("width", String(targetWidth));
    svg.setAttribute("height", String(targetHeight));
  }

  const source = encodeURIComponent(serializeSvg(svg));
  const dataUrl = `data:image/svg+xml;charset=utf-8,${source}`;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (context === null) {
        reject(new Error("Could not create a 2D canvas context for the PNG export."));
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      reject(new Error("The SVG could not be loaded for the PNG export."));
    };
    image.src = dataUrl;
  });
}
