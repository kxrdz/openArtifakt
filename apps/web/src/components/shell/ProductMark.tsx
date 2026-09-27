import type { SVGProps } from "react";

/**
 * The OpenArtifact product mark: a rounded tile with a split-pane glyph —
 * the workspace itself (chat left, artifact right) as the identity. Authored
 * here, not borrowed from a library, so the brand stays its own.
 */
export function ProductGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="M12 4v16" />
      <path d="M7 9h2M7 13h2" />
      <path d="M15 9h2M15 13h2" />
    </svg>
  );
}

/**
 * Product mark with wordmark, rendered as the document's single `<h1>`.
 * The glyph tile is decorative (`aria-hidden`) so the accessible name of the
 * heading is exactly "OpenArtifact".
 */
export function ProductMark() {
  return (
    <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-text">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg"
        aria-hidden="true"
      >
        <ProductGlyph className="h-4 w-4" />
      </span>
      OpenArtifact
    </h1>
  );
}
