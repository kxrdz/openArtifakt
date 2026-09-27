/**
 * Artifact-turn fixture (§12.7, task 5.1).
 *
 * The scripted artifact turn streams one `<artifact>` block per type (react,
 * html, svg, mermaid, code) plus a valid and an invalid ```mermaid fence. This
 * module owns the exact content and the markers the e2e test asserts against,
 * so the fake-provider fixture and the Playwright spec can never drift apart.
 * It is dependency-free (pure strings) so both the server and the e2e spec can
 * import it directly.
 */

/** Text streamed before the artifact blocks (prose the message list shows). */
export const FAKE_ARTIFACT_INTRO_TEXT = "Here are the artifact types:";

// --- React ---------------------------------------------------------------

export const FAKE_REACT_TITLE = "Sandbox probe";
export const FAKE_REACT_IDENTIFIER = "sandbox-probe";

/** Rendered by the sandboxed preview when parent access is correctly blocked. */
export const FAKE_REACT_SANDBOXED_MARKER = "sandboxed";
/** Rendered only if the sandbox incorrectly allows access to the parent. */
export const FAKE_REACT_ACCESSIBLE_MARKER = "PARENT ACCESSIBLE";

/**
 * A single-file React component whose render attempts to read
 * `window.parent.document`. Inside the `sandbox="allow-scripts"` iframe (no
 * `allow-same-origin`) that access throws, so the component renders the
 * blocked marker; the e2e test asserts that marker (and never the accessible
 * one), which proves the sandbox really isolates the preview.
 */
export const FAKE_REACT_SOURCE = `export default function App() {
  let status = "checking";
  try {
    void window.parent.document;
    status = "${FAKE_REACT_ACCESSIBLE_MARKER}";
  } catch {
    status = "${FAKE_REACT_SANDBOXED_MARKER}";
  }
  return <div>React preview rendered - sandbox: {status}</div>;
}`;

/**
 * A second version of the React artifact (turn 6). It reuses the same
 * `identifier`, so per §5 the artifact gains a version instead of a new
 * entry. The rendered text and one comment differ from {@link
 * FAKE_REACT_SOURCE} so the diff view shows a real change.
 */
export const FAKE_REACT_SOURCE_V2 = `// version 2
export default function App() {
  let status = "checking";
  try {
    void window.parent.document;
    status = "${FAKE_REACT_ACCESSIBLE_MARKER}";
  } catch {
    status = "${FAKE_REACT_SANDBOXED_MARKER}";
  }
  return <div>React preview v2 - sandbox: {status}</div>;
}`;

// --- HTML ----------------------------------------------------------------

export const FAKE_HTML_TITLE = "Static page";
export const FAKE_HTML_IDENTIFIER = "static-page";
export const FAKE_HTML_MARKER = "HTML preview rendered";

export const FAKE_HTML_SOURCE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Static page</title>
  </head>
  <body>
    <h1>${FAKE_HTML_MARKER}</h1>
  </body>
</html>`;

// --- SVG -----------------------------------------------------------------

export const FAKE_SVG_TITLE = "Logo";
export const FAKE_SVG_IDENTIFIER = "logo";
export const FAKE_SVG_MARKER = "SVG preview rendered";

export const FAKE_SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">
  <rect width="240" height="80" fill="#4f46e5" rx="8" />
  <text x="120" y="46" text-anchor="middle" fill="#ffffff" font-size="18" font-family="sans-serif">${FAKE_SVG_MARKER}</text>
</svg>`;

// --- Mermaid artifact ----------------------------------------------------

export const FAKE_MERMAID_TITLE = "Flow";
export const FAKE_MERMAID_IDENTIFIER = "flow";

/** The Mermaid artifact source (valid; rendered in the panel). */
export const FAKE_MERMAID_SOURCE = "graph TD\n    A[Start] --> B[Render]";

// --- Code ----------------------------------------------------------------

export const FAKE_CODE_TITLE = "example.ts";
export const FAKE_CODE_IDENTIFIER = "example-ts";
export const FAKE_CODE_LANGUAGE = "typescript";

export const FAKE_CODE_SOURCE = `const answer: number = 42;
function double(value: number): number {
  return value * 2;
}
export default double(answer);`;

// --- Inline Mermaid fences ----------------------------------------------

/** A valid ```mermaid fence, rendered inline in the message list. */
export const FAKE_VALID_MERMAID_SOURCE = "graph LR\n  A[ValidFlow] --> B[Diagram]";

/**
 * An invalid ```mermaid fence: `B -->>` is not a valid edge, so mermaid fails
 * to parse on line 3 and the message list shows an inline syntax error.
 */
export const FAKE_INVALID_MERMAID_SOURCE = "graph TD\n  A[BrokenFlow] --> B[Edge]\n  B -->>";

// --- Assembled turn text --------------------------------------------------

const FENCE = "```";

/** Wrap source in a ```mermaid fence. */
function mermaidFence(source: string): string {
  return `${FENCE}mermaid\n${source}\n${FENCE}`;
}

/** Wrap source in an `<artifact …>` block with the given attributes. */
function artifactBlock(attributes: string, source: string): string {
  return `<artifact ${attributes}>\n${source}\n</artifact>`;
}

/** The full text of the artifact turn, streamed as one scripted turn. */
export const FAKE_ARTIFACTS_TEXT: string = [
  FAKE_ARTIFACT_INTRO_TEXT,
  "",
  artifactBlock(
    `type="application/vnd.react" title="${FAKE_REACT_TITLE}" identifier="${FAKE_REACT_IDENTIFIER}"`,
    FAKE_REACT_SOURCE,
  ),
  "",
  artifactBlock(
    `type="text/html" title="${FAKE_HTML_TITLE}" identifier="${FAKE_HTML_IDENTIFIER}"`,
    FAKE_HTML_SOURCE,
  ),
  "",
  artifactBlock(
    `type="image/svg+xml" title="${FAKE_SVG_TITLE}" identifier="${FAKE_SVG_IDENTIFIER}"`,
    FAKE_SVG_SOURCE,
  ),
  "",
  artifactBlock(
    `type="application/vnd.mermaid" title="${FAKE_MERMAID_TITLE}" identifier="${FAKE_MERMAID_IDENTIFIER}"`,
    FAKE_MERMAID_SOURCE,
  ),
  "",
  artifactBlock(
    `type="application/vnd.code" title="${FAKE_CODE_TITLE}" language="${FAKE_CODE_LANGUAGE}" identifier="${FAKE_CODE_IDENTIFIER}"`,
    FAKE_CODE_SOURCE,
  ),
  "",
  "Valid inline diagram:",
  mermaidFence(FAKE_VALID_MERMAID_SOURCE),
  "",
  "Invalid inline diagram:",
  mermaidFence(FAKE_INVALID_MERMAID_SOURCE),
].join("\n") + "\n";

/** Prose streamed before the version-2 react block (turn 6). */
export const FAKE_REACT_V2_INTRO = "Updating the sandbox probe:";

/**
 * The full text of the version turn (turn 6): the React artifact re-streamed
 * with the same identifier, appending version 2 (§5 versioning).
 */
export const FAKE_REACT_V2_TEXT: string = [
  FAKE_REACT_V2_INTRO,
  "",
  artifactBlock(
    `type="application/vnd.react" title="${FAKE_REACT_TITLE}" identifier="${FAKE_REACT_IDENTIFIER}"`,
    FAKE_REACT_SOURCE_V2,
  ),
].join("\n") + "\n";
