import { cn } from "./cn";
import { focusRing } from "./focus-ring";

/**
 * Compact select styling shared by the artifact-panel version dropdown and the
 * diff view's version pickers. One source so the two controls can never drift
 * (§12.9 polish: the audit's "versionSelectClass duplicated" finding).
 */
export const versionSelectClass = cn(
  "h-7 rounded-md border border-border bg-bg-sunken px-1.5 font-sans text-xs font-medium text-text",
  focusRing,
);
