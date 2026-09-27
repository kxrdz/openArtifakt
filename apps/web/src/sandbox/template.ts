/**
 * Sandbox srcdoc template (§6, §12.7).
 *
 * Every React/HTML preview runs in an `<iframe sandbox="allow-scripts">` with
 * an opaque origin, so it can only load ES modules that the local server serves
 * with `Access-Control-Allow-Origin: *`. This module builds the srcdoc for
 * those iframes: the import map that resolves exactly the vendored specifiers,
 * the vendored Tailwind browser runtime, the postMessage runtime-error/console
 * bridge, and the module script that loads and renders the artifact. It is
 * dependency-free so the template and import map are unit-testable in Node.
 */

/**
 * The exact `sandbox` attribute on every preview iframe: scripts are allowed,
 * `allow-same-origin` is NEVER present (an opaque origin is the isolation
 * boundary — without it, preview code could reach `window.parent.document`).
 */
export const SANDBOX_ATTRIBUTES = "allow-scripts";

/** The bare specifiers the import map resolves, all served under `/vendor`. */
export const VENDOR_IMPORTS = {
  react: "/vendor/react.js",
  "react-dom": "/vendor/react-dom.js",
  "react/jsx-runtime": "/vendor/react-jsx-runtime.js",
  "lucide-react": "/vendor/lucide-react.js",
  recharts: "/vendor/recharts.js",
} as const;

/** The only bare specifiers a preview may import. Anything else fails loudly. */
export const VENDORED_SPECIFIERS: readonly string[] = Object.keys(VENDOR_IMPORTS);

/** The vendored Tailwind browser runtime (a classic script, not a module). */
export const TAILWIND_RUNTIME_URL = "/vendor/tailwind-browser.js";

/** The import-map object embedded in the srcdoc `<script type="importmap">`. */
export function buildImportMap(): { imports: Record<string, string> } {
  return { imports: { ...VENDOR_IMPORTS } };
}

/** JSON serialization of the import map (the text inside the script tag). */
export function buildImportMapJson(): string {
  return JSON.stringify(buildImportMap());
}

/**
 * The bridge runtime injected into every preview document as a classic script.
 *
 * It posts `{ __openartifact: true, kind, message, stack?, level? }` to the
 * parent for `error`, `unhandledrejection` and console output, and exposes
 * `window.__openartifactReport(kind, message, stack)` so the module script (or
 * an error boundary) can report caught errors through the same channel. It runs
 * first so no early error escapes it.
 */
export const RUNTIME_BRIDGE_SOURCE = [
  '(function () {',
  '  function report(kind, message, stack, level) {',
  '    try {',
  '      var payload = { __openartifact: true, kind: kind, message: String(message) };',
  '      if (stack) payload.stack = String(stack);',
  '      if (level) payload.level = level;',
  '      window.parent.postMessage(payload, "*");',
  '    } catch (e) { /* the parent may be gone; nothing to do */ }',
  '  }',
  '  window.__openartifactReport = function (kind, message, stack) {',
  '    report(kind, message, stack, undefined);',
  '  };',
  '  window.addEventListener("error", function (event) {',
  '    var error = event.error;',
  '    report(',
  '      "runtime-error",',
  '      event.message || (error ? String(error) : "Unknown error"),',
  '      error && error.stack ? error.stack : "",',
  '      undefined',
  '    );',
  '  });',
  '  window.addEventListener("unhandledrejection", function (event) {',
  '    var reason = event.reason;',
  '    report(',
  '      "unhandled-rejection",',
  '      reason && reason.message ? reason.message : String(reason),',
  '      reason && reason.stack ? reason.stack : "",',
  '      undefined',
  '    );',
  '  });',
  '  var levels = ["log", "info", "warn", "error"];',
  '  for (var i = 0; i < levels.length; i++) {',
  '    (function (level) {',
  '      var original = console[level];',
  '      console[level] = function () {',
  '        var parts = [];',
  '        for (var j = 0; j < arguments.length; j++) {',
  '          var arg = arguments[j];',
  '          try {',
  '            parts.push(typeof arg === "string" ? arg : JSON.stringify(arg));',
  '          } catch (e) {',
  '            parts.push(String(arg));',
  '          }',
  '        }',
  '        report("console", parts.join(" "), undefined, level);',
  '        return original.apply(console, arguments);',
  '      };',
  '    })(levels[i]);',
  '  }',
  '})();',
].join("\n");

/** Options for {@link buildPreviewDocument}. */
export interface PreviewDocumentOptions {
  /** The body of the `<script type="module">` that runs the artifact. */
  moduleScript: string;
  /** Include the vendored Tailwind browser runtime (React previews: true). */
  tailwind?: boolean;
}

/**
 * Build a full preview document (the `srcdoc`): import map, Tailwind runtime
 * when requested, the bridge runtime, a `#root` mount, and the module script.
 */
export function buildPreviewDocument(options: PreviewDocumentOptions): string {
  const head = [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<script type="importmap">${buildImportMapJson()}</script>`,
    ...(options.tailwind ? [`<script src="${TAILWIND_RUNTIME_URL}"></script>`] : []),
    `<script>${RUNTIME_BRIDGE_SOURCE}</script>`,
  ];
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    ...head,
    "</head>",
    "<body>",
    '<div id="root"></div>',
    '<script type="module">',
    options.moduleScript,
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Build the module script for a React preview.
 *
 * The transpiled code is embedded as a string, written to a blob URL inside the
 * iframe (a parent-created blob URL would be cross-origin to the opaque iframe
 * and fail to fetch), dynamically imported — so the default export is read from
 * the module namespace regardless of how the component is declared — and
 * rendered behind an error boundary. The blob URL is revoked after the import
 * settles, so no URL leaks across updates.
 */
export function buildReactModuleScript(transpiledCode: string): string {
  const encoded = JSON.stringify(transpiledCode);
  return [
    'import React from "react";',
    'import { createRoot } from "react-dom";',
    "",
    `const __artifactCode = ${encoded};`,
    'const __artifactUrl = URL.createObjectURL(new Blob([__artifactCode], { type: "text/javascript" }));',
    "",
    "class __ArtifactErrorBoundary extends React.Component {",
    "  constructor(props) { super(props); this.state = { error: null }; }",
    "  static getDerivedStateFromError(error) { return { error }; }",
    "  componentDidCatch(error) {",
    "    if (window.__openartifactReport) {",
    '      window.__openartifactReport("runtime-error", error && error.message ? error.message : String(error), error && error.stack ? error.stack : "");',
    "    }",
    "  }",
    "  render() {",
    "    if (this.state.error) {",
    "      const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error);",
    '      return React.createElement("pre", null, "Render error: " + message);',
    "    }",
    "    return this.props.children;",
    "  }",
    "}",
    "",
    "(async () => {",
    "  try {",
    "    const __module = await import(__artifactUrl);",
    "    const Component = __module.default;",
    '    if (typeof Component !== "function") {',
    '      throw new Error("The React artifact must export a component as its default export.");',
    "    }",
    '    const root = document.getElementById("root");',
    "    root.textContent = \"\";",
    '    createRoot(root).render(React.createElement(__ArtifactErrorBoundary, null, React.createElement(Component)));',
    "  } catch (error) {",
    "    const message = error && error.message ? error.message : String(error);",
    "    const stack = error && error.stack ? error.stack : \"\";",
    '    if (window.__openartifactReport) window.__openartifactReport("runtime-error", message, stack);',
    '    const root = document.getElementById("root");',
    '    root.textContent = "Preview failed to load:\\n" + message + (stack ? "\\n\\n" + stack : "");',
    "  } finally {",
    "    URL.revokeObjectURL(__artifactUrl);",
    "  }",
    "})();",
  ].join("\n");
}

/**
 * Build a module script that reports a parent-side compile failure (e.g. a
 * sucrase transform error) through the same bridge channel as runtime errors,
 * so every failure surfaces in one place.
 */
export function buildCompileErrorScript(message: string): string {
  const encoded = JSON.stringify(message);
  return [
    `const message = ${encoded};`,
    'if (window.__openartifactReport) window.__openartifactReport("runtime-error", "Could not compile the React artifact: " + message, "");',
    'const root = document.getElementById("root");',
    'root.textContent = "Could not compile the React artifact:\\n" + message;',
  ].join("\n");
}

/**
 * Inject the bridge runtime into an HTML artifact's document, after `<head>`
 * when present (otherwise after `<html>`/`<body>`, or at the very start).
 */
export function injectSandboxBridge(html: string): string {
  const script = `<script>${RUNTIME_BRIDGE_SOURCE}</script>`;
  for (const pattern of [/<head[^>]*>/i, /<html[^>]*>/i, /<body[^>]*>/i]) {
    const match = pattern.exec(html);
    if (match) {
      const index = match.index + match[0].length;
      return html.slice(0, index) + script + html.slice(index);
    }
  }
  return script + html;
}
