import { useEffect, useState } from "react";

/**
 * Active-theme hook.
 *
 * The theme is stored as `data-theme` on `<html>` (set before first paint by
 * the inline bootstrap in index.html, and later by the settings drawer). Dark
 * is the default and first-class theme; any value other than `light` resolves
 * to dark.
 */

/** The two supported color themes. */
export type ThemeName = "light" | "dark";

/** Read the active theme from the document root (dark when unset/unknown). */
function readThemeName(): ThemeName {
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" ? "light" : "dark";
}

/**
 * Subscribe to the active theme and re-render when it changes. The Mermaid
 * renderers use this so diagrams recolor when `data-theme` is flipped without
 * a page reload (the settings drawer toggles the attribute in place).
 */
export function useActiveTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>(() => readThemeName());

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readThemeName()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    setTheme(readThemeName());
    return () => observer.disconnect();
  }, []);

  return theme;
}
