/**
 * Clipboard helpers (§12.7, "Code: copy button").
 *
 * `copyText` prefers the async Clipboard API and falls back to a hidden
 * textarea + `document.execCommand("copy")` when the API is unavailable (e.g.
 * a non-secure context). The return value lets callers reflect success in the
 * UI ("Copied") without throwing on every platform quirk.
 */

/** Copy `text` to the system clipboard. Resolves true when a copy succeeded. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Off-screen, not hidden: `display: none` makes some browsers skip select.
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
