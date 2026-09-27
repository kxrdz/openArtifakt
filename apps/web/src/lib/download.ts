/**
 * Client-side download helper (§12.7, "SVG: export as SVG and PNG").
 *
 * Triggers a browser download from a Blob (SVG text) or a data URL (PNG raster)
 * by creating and clicking a temporary anchor. The anchor is removed and its
 * object URL revoked so nothing leaks.
 */

/** Download a string as a file with the given MIME type and filename. */
export function downloadText(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadUrl(filename, url);
  URL.revokeObjectURL(url);
}

/** Download a data URL (e.g. `data:image/png;base64,…`) as a file. */
export function downloadUrl(filename: string, url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
