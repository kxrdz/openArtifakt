/**
 * Mermaid rendering helper (§12.7, design decision 7).
 *
 * Mermaid is browser-only (it measures and injects into the DOM), so it is
 * imported lazily and never sits on the chat's critical path. The diagram
 * colors come from the design tokens: `buildThemeVariables` maps the token
 * values onto mermaid's `themeVariables`, so a diagram recolors with
 * light/dark automatically — no literal colors appear in JS, they always come
 * from the CSS tokens in `styles/tokens.css`.
 */

import type { ThemeName } from "../../hooks/useTheme";
import { svgToPngDataUrl } from "./svg";

/** CSS custom properties that feed mermaid's `themeVariables`. */
const TOKEN_VARS = {
  background: "--color-bg",
  surface: "--color-bg-elevated",
  sunken: "--color-bg-sunken",
  border: "--color-border-strong",
  text: "--color-text",
  mutedText: "--color-text-muted",
  fontFamily: "--font-sans",
} as const;

/** The design-token values mermaid needs, read from the active theme. */
export interface MermaidThemeTokens {
  background: string;
  surface: string;
  sunken: string;
  border: string;
  text: string;
  mutedText: string;
  fontFamily: string;
}

/** Read the token values mermaid uses from the live document. */
export function readMermaidTokens(root: Element = document.documentElement): MermaidThemeTokens {
  const style = getComputedStyle(root);
  const read = (name: string): string => style.getPropertyValue(name).trim();
  return {
    background: read(TOKEN_VARS.background),
    surface: read(TOKEN_VARS.surface),
    sunken: read(TOKEN_VARS.sunken),
    border: read(TOKEN_VARS.border),
    text: read(TOKEN_VARS.text),
    mutedText: read(TOKEN_VARS.mutedText),
    fontFamily: read(TOKEN_VARS.fontFamily),
  };
}

/**
 * Map token values onto mermaid's `themeVariables` (pure, so the mapping is
 * unit-testable). Empty values are skipped so mermaid falls back to its own
 * defaults rather than receiving an empty (invalid) color string.
 */
export function buildThemeVariables(tokens: MermaidThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {};
  const set = (name: string, value: string): void => {
    if (value.trim() !== "") variables[name] = value;
  };

  set("background", tokens.background);
  set("primaryColor", tokens.surface);
  set("primaryTextColor", tokens.text);
  set("primaryBorderColor", tokens.border);
  set("lineColor", tokens.border);
  set("secondaryColor", tokens.sunken);
  set("tertiaryColor", tokens.surface);
  set("clusterBkg", tokens.sunken);
  set("clusterBorder", tokens.border);
  set("nodeBorder", tokens.border);
  set("nodeTextColor", tokens.text);
  set("mainBkg", tokens.surface);
  set("edgeLabelBackground", tokens.surface);
  set("titleColor", tokens.text);
  set("textColor", tokens.text);
  set("noteBkgColor", tokens.sunken);
  set("noteTextColor", tokens.mutedText);
  set("noteBorderColor", tokens.border);
  set("fontFamily", tokens.fontFamily);

  return variables;
}

/** A Mermaid parse/render failure, carrying the offending 1-based line when known. */
export class MermaidRenderError extends Error {
  readonly line: number | undefined;

  constructor(message: string, line?: number) {
    super(message);
    this.name = "MermaidRenderError";
    this.line = line;
  }
}

/** Extract the offending 1-based line from a mermaid error message, if present. */
export function mermaidErrorLine(message: string): number | undefined {
  const match = /line\s+(\d+)/i.exec(message);
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  const line = Number.parseInt(raw, 10);
  return Number.isFinite(line) && line > 0 ? line : undefined;
}

/** Normalize any thrown value into a {@link MermaidRenderError}. */
export function toRenderError(error: unknown): MermaidRenderError {
  if (error instanceof MermaidRenderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new MermaidRenderError(message, mermaidErrorLine(message));
}

/** One lazily-loaded mermaid instance per app lifetime. */
type Mermaid = typeof import("mermaid").default;
let mermaidPromise: Promise<Mermaid> | null = null;

function ensureMermaid(): Promise<Mermaid> {
  if (mermaidPromise === null) {
    mermaidPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidPromise;
}

/** Unique element id per render, so consecutive renders never collide. */
let nextDiagramId = 0;

/**
 * Render a Mermaid diagram to SVG.
 *
 * `theme` is the active theme name; the colors themselves are read from the
 * live document tokens (which already encode light vs. dark via `data-theme`).
 * The parameter keeps the renderer contract explicit so callers always pass
 * the active theme and re-render when it changes. Renders with
 * `securityLevel: "strict"`, validates with `parse()` before `render()`, and
 * uses a fresh id per render.
 */
export async function renderMermaid(source: string, theme: ThemeName): Promise<string> {
  void theme; // palette comes from the live tokens; the name documents intent.
  const mermaid = await ensureMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: buildThemeVariables(readMermaidTokens()),
  });
  try {
    await mermaid.parse(source);
  } catch (error) {
    throw toRenderError(error);
  }
  const id = `mermaid-diagram-${nextDiagramId}`;
  nextDiagramId += 1;
  const { svg } = await mermaid.render(id, source);
  return svg;
}

/** Default raster size when a diagram SVG carries no viewBox dimensions. */
const DEFAULT_MERMAID_SIZE = 800;

/**
 * Rasterize a rendered Mermaid SVG to a PNG data URL.
 *
 * Mermaid emits `width="100%"` plus a `max-width` inline style, which would
 * mislead a width/height-based raster into a tiny image. The intrinsic size is
 * read from the `viewBox` instead, the `style` is dropped, and the canvas
 * rasterization is delegated to the shared SVG exporter (which clamps to the
 * size cap).
 */
export function mermaidToPngDataUrl(markup: string): Promise<string> {
  const documentNode = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = documentNode.documentElement;
  if (svg === null) return Promise.reject(new Error("The diagram SVG could not be parsed."));

  const parts = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/) ?? [];
  const vbWidth = Number(parts[2]);
  const vbHeight = Number(parts[3]);
  const width = Number.isFinite(vbWidth) && vbWidth > 0 ? vbWidth : DEFAULT_MERMAID_SIZE;
  const height = Number.isFinite(vbHeight) && vbHeight > 0 ? vbHeight : DEFAULT_MERMAID_SIZE;

  svg.setAttribute("width", String(Math.max(1, Math.round(width))));
  svg.setAttribute("height", String(Math.max(1, Math.round(height))));
  svg.removeAttribute("style"); // drop `max-width` so the raster uses intrinsic size

  return svgToPngDataUrl(new XMLSerializer().serializeToString(svg));
}
