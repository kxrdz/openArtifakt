/**
 * Join class names, dropping falsy values.
 *
 * A tiny local helper so the primitives never depend on `clsx`/`classnames` for
 * a single conditional-join call.
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
