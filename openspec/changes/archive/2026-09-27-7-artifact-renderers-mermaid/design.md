# Design

## Context

The engine (§2–§5) and the chat surface (§12.6) are complete. The chat store accumulates assistant `text` events into a plain string and `MessageItem` renders it `whitespace-pre-wrap`; the `ArtifactPanel` is the empty state only. Two constraints shape the approach:

- `packages/core` must stay out of the browser (it imports `node:*` via tools/providers/agent). The `StreamParser` is pure (only zod, no DOM/node) but lives in core, so the web currently cannot parse `<artifact>` blocks or ```mermaid fences.
- Everything is offline: the iframe sandbox has an opaque origin, so vendored modules must be served locally with CORS; runtime deps (mermaid/shiki/sucrase/dompurify) are npm packages bundled by Vite, never CDNs.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Parse assistant text once, in the browser, with the same `StreamParser` the adapters use, and render the five artifact types plus inline Mermaid.
- Sandbox React/HTML previews with no `allow-same-origin`, `postMessage`-only, and a runtime-error bridge.
- Keep everything green and offline: vendored ESM served by the local server, key-free e2e/screenshots via the fake provider.

**Non-Goals:**

- Version diff/revert, undo, settings and SQLite persistence — feature 8. The artifact model stores a `versions` list so feature 8 can hang a version dropdown + Monaco diff on it, but feature 7 renders only the latest version.
- "Write to disk" for code artifacts — deferred to feature 8 (it is a user-initiated mutation needing the snapshot/approval machinery outside the agent loop, the same seam "Undo this turn" needs).
- Monaco, the command palette and the final harden/onboard pass — features 8–9.
- Streaming-preview compilation on partial React code (Preview builds only on close, or on a debounced retry only when it compiles).

## Decisions

### 1. Move the parser into `packages/shared`; core re-exports it

The web may import `@openartifact/shared` but never `@openartifact/core`. The parser is already dependency-free of core's node modules (it only imports `zod`, which shared already has), so the cleanest single-parser solution is to move `parser/events.ts` + `stream-parser.ts` (and their tests, including the chunk-boundary fuzz test) into `packages/shared/src/parser/`. `packages/core/src/parser/` becomes a re-export of shared's parser, so `providers/fallback.ts`, `prompts/system.ts`, the parser tests and the fuzz test keep their relative imports working, and `packages/core/src/index.ts` still does `export * from "./parser"`.

- Alternative: re-implement a web-only parser (duplicates a tested, fuzz-verified state machine and drifts); give the web a dependency on core (fails at Vite build on `node:*` imports); a new `packages/parser` leaf package (a third package for two files, more workspace wiring for no gain).

### 2. Parse the accumulated message text on every render (whole-string mode)

`StreamParser` is incremental, but the client can drive it in "whole document" mode: `push(fullContent)` then `end()`. The fuzz test already guarantees whole-input equals split-input, so re-parsing the growing message content each render is correct and idempotent. A pure `parseDocument(content)` reducer folds the `ParserEvent` sequence into a normalized model:

- `text` blocks (prose),
- `mermaid` blocks (complete inline diagrams; an open fence at `end()` closes and is rendered only when complete),
- artifacts keyed by `identifier` with `title`, `artifactType`, `language` and a `versions: ArtifactVersion[]` list.

An `artifact_close { incomplete: true }` marks the current version as still streaming. While the last version of an identifier is `incomplete`, re-parsing updates its content in place; once closed, a new `artifact_open` for the same identifier appends a new version (never replacing history).

### 3. Artifact state lives in a dedicated Zustand store, keyed off chat content

A new `useArtifactStore` (separate from `chatStore`) holds `artifacts: Map<identifier, Artifact>` and `selectedId`. It subscribes to `chatStore.messages` (the last assistant message's content) and re-derives artifacts on each text change. Keeping it separate avoids entangling the chat transport reducer with rendering concerns, and gives feature 8 a clean store to add version selection/diff/revert. The artifact switcher and panel read only `artifactStore`.

### 4. React preview: browser transpile with sucrase + import map + vendored ESM

React artifacts transpile in the browser with `sucrase` (TSX → ESM, automatic JSX runtime), then load in the sandboxed iframe via an `importmap` mapping `react`, `react-dom`, `lucide-react`, `recharts` (and `react/jsx-runtime`) to `/vendor/*.js`. A vendored Tailwind browser runtime (`@tailwindcss/browser`) is included in the srcdoc so Tailwind classes work offline. The import map limits imports to the four vendored modules; any other specifier fails the module load and the error bridge surfaces a clear "unknown import" message.

- Alternative: `esbuild-wasm` (larger wasm payload, same job); a hosted bundler like Sandpack (sends user code off-machine, breaks offline — explicitly rejected by §6).

### 5. Only the iframe's dependencies go through `/vendor`; the app's own deps are Vite-bundled

`react`, `react-dom`, `lucide-react`, `recharts` and the Tailwind runtime are consumed *inside the opaque-origin iframe*, so they are bundled once (a `scripts/vendor.mjs` esbuild script) into `apps/web/public/vendor/` and served by a server `/vendor/*` route with `Access-Control-Allow-Origin: *`. `mermaid`, `dompurify`, `shiki` and `sucrase` run in the parent app (SVG/Mermaid/Code render inline in the panel; sucrase transpiles in the parent before the srcdoc is written), so the app imports them normally and Vite code-splits them via dynamic `import()` — no vendor file, no CORS needed. This keeps the vendor surface minimal (5 files) and the initial bundle lean.

- The `/vendor` route is registered before the dev catch-all proxy and reads `apps/web/public/vendor` in dev / `apps/web/dist/vendor` in prod, so the browser always fetches it from the server origin (4318) in both modes.

### 6. One iframe per artifact, srcdoc replaced, blob URLs revoked

`ReactPreview`/`HtmlPreview` keep a single `<iframe sandbox="allow-scripts">` per artifact instance; an update replaces `srcdoc` (never mounts a second iframe), and any blob URL created for a preview is revoked on replace/unmount. The parent accepts `message` events only when `event.source === iframe.contentWindow`. The srcdoc template includes `window.onerror`, `unhandledrejection` and a React error boundary; errors and console output are `postMessage`d to the parent and rendered below the preview with "Send error to agent" (wired as a note to the agent in a later feature; the action is present and surfaces the error).

### 7. Mermaid: strict init, parse-before-render, unique ids, token-derived theme

`MermaidViewer` and `InlineMermaid` share a `renderMermaid(source, theme)` helper: `mermaid.initialize({ startOnLoad: false, securityLevel: "strict" })`, `mermaid.parse(source)` before `mermaid.render(id, source)`, a unique id per render (counter), and a `themeVariables` map derived from the CSS design tokens (`--color-*`) so diagrams recolor on theme change. Rendering is debounced 300 ms and only for complete fences/blocks. A parse error renders the source with the message and offending line highlighted; it never throws into the message list. Zoom/pan/reset/copy/download wrap the rendered SVG (pan/zoom via transform; copy/download via SVG serialization and a canvas raster for PNG).

### 8. SVG sanitization with DOMPurify; export via serialization + canvas

`SvgViewer` sanitizes the SVG with DOMPurify's SVG profile before inlining it. Export downloads the sanitized SVG source and rasterizes to PNG via a canvas + `Image` from an SVG data URL (with a size cap so huge SVGs don't exhaust the canvas).

### 9. Code highlighting with shiki, themed from tokens

`CodeViewer` highlights with `shiki` (dynamic import, bundled locally) using a custom theme built from the design tokens' colors (matching light/dark). The highlighter is only for display; the raw source stays untouched for copy. The `language` attribute selects the grammar, with a sensible fallback (e.g. unknown → plain text; `image/svg+xml` → `xml`).

### 10. e2e and screenshots reuse the fake provider

The fake provider's fixture gains a scripted turn whose streamed `text` contains one of each artifact type (react, html, svg, mermaid, code) plus an invalid ```mermaid fence and a valid one. This exercises the real client parser/renderers key-free. `e2e/artifacts.spec.ts` asserts each type renders, asserts the sandbox isolation (an HTML artifact whose script tries `window.parent.document` fails to reach it), and asserts the invalid diagram shows an inline error without crashing. `screenshots.spec.ts` captures each artifact type and the Mermaid error in both themes/viewports.

## Risks / Trade-offs

- [Mermaid/shiki/recharts are heavy (~MBs)] → they are dynamic-imported (app) or served once locally (vendor), and never on the critical path of the chat; a local-first tool trades disk for offline correctness.
- [Vendored bundles are committed generated artifacts] → the vendor script is deterministic and run in CI; a drift check (`pnpm build` regenerates) prevents staleness.
- [sucrase JSX output vs. React 18 runtime] → use the automatic runtime with `react/jsx-runtime` in the import map; a unit test asserts the srcdoc template and import map reference only vendored specifiers.
- [Re-parsing full message content on every token is O(n) per render] → content is bounded by the context cap (~20k chars), far below a perf concern; the parser is a fast char loop. If it ever matters, memoize on message id + content length.
- [Canvas PNG export of very large SVGs] → cap raster dimensions and surface a clear error when exceeded.
- [Mermaid internal dynamic imports for rare diagram types] → render errors are caught and shown as the syntax/error state, never a crash.
