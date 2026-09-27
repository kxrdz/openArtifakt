import { describe, expect, it } from "vitest";

import {
  RUNTIME_BRIDGE_SOURCE,
  SANDBOX_ATTRIBUTES,
  VENDORED_SPECIFIERS,
  VENDOR_IMPORTS,
  buildImportMap,
  buildPreviewDocument,
  buildReactModuleScript,
  injectSandboxBridge,
} from "./template";

describe("sandbox attributes", () => {
  it("allows scripts and never allow-same-origin", () => {
    expect(SANDBOX_ATTRIBUTES).toBe("allow-scripts");
    expect(SANDBOX_ATTRIBUTES).not.toContain("allow-same-origin");
  });
});

describe("import map", () => {
  it("resolves exactly the five vendored specifiers", () => {
    expect(VENDORED_SPECIFIERS).toEqual([
      "react",
      "react-dom",
      "react/jsx-runtime",
      "lucide-react",
      "recharts",
    ]);
  });

  it("points every specifier at the local /vendor route and nowhere else", () => {
    const map = buildImportMap();
    expect(Object.keys(map.imports)).toEqual(VENDORED_SPECIFIERS);
    for (const url of Object.values(map.imports)) {
      expect(url.startsWith("/vendor/")).toBe(true);
      // Offline-only: never a CDN or remote origin.
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });

  it("maps the automatic JSX runtime specifier for sucrase output", () => {
    expect(VENDOR_IMPORTS["react/jsx-runtime"]).toBe("/vendor/react-jsx-runtime.js");
  });
});

describe("buildPreviewDocument", () => {
  const moduleScript = 'document.getElementById("root").textContent = "hi";';

  it("embeds the import map, bridge runtime and the module script", () => {
    const doc = buildPreviewDocument({ moduleScript });
    expect(doc).toContain('<script type="importmap">');
    expect(doc).toContain(JSON.stringify(buildImportMap()));
    expect(doc).toContain(`<script>${RUNTIME_BRIDGE_SOURCE}</script>`);
    expect(doc).toContain(moduleScript);
    expect(doc).toContain('<div id="root"></div>');
  });

  it("includes the vendored Tailwind runtime only when requested", () => {
    const withTailwind = buildPreviewDocument({ moduleScript, tailwind: true });
    expect(withTailwind).toContain('<script src="/vendor/tailwind-browser.js"></script>');

    const withoutTailwind = buildPreviewDocument({ moduleScript });
    expect(withoutTailwind).not.toContain("tailwind-browser.js");
  });
});

describe("buildReactModuleScript", () => {
  it("embeds the transpiled code, imports the vendored modules, and revokes the blob URL", () => {
    const script = buildReactModuleScript("export default function App() {}");

    // React + ReactDOM come from the import map (bare, vendored specifiers).
    expect(script).toContain('import React from "react"');
    expect(script).toContain('import { createRoot } from "react-dom"');

    // The transpiled code is embedded as a JSON string and loaded via blob URL…
    expect(script).toContain('const __artifactCode = "export default function App() {}"');
    expect(script).toContain("URL.createObjectURL");
    expect(script).toContain("await import(__artifactUrl)");
    expect(script).toContain("createRoot(root).render");
    // …and the blob URL is always revoked so no URL leaks across updates.
    expect(script).toContain("URL.revokeObjectURL(__artifactUrl)");
  });

  it("rejects a module without a default-export component with a clear error", () => {
    const script = buildReactModuleScript("export const x = 1;");
    expect(script).toContain("must export a component as its default export");
  });
});

describe("injectSandboxBridge", () => {
  const bridgeTag = `<script>${RUNTIME_BRIDGE_SOURCE}</script>`;

  it("injects after <head> when present", () => {
    const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
    expect(injectSandboxBridge(html)).toBe(
      "<!doctype html><html><head>" + bridgeTag + "<title>x</title></head><body></body></html>",
    );
  });

  it("injects after <html> when there is no <head>", () => {
    const html = "<!doctype html><html><body></body></html>";
    expect(injectSandboxBridge(html)).toBe(
      "<!doctype html><html>" + bridgeTag + "<body></body></html>",
    );
  });

  it("injects after <body> when only a body exists", () => {
    const html = "<body><h1>hi</h1></body>";
    expect(injectSandboxBridge(html)).toBe("<body>" + bridgeTag + "<h1>hi</h1></body>");
  });

  it("prepends when the document has no known container", () => {
    expect(injectSandboxBridge("<div>x</div>")).toBe(bridgeTag + "<div>x</div>");
  });
});
