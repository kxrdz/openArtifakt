# Tasks

## 1. Parser in shared + web artifact model

- [x] 1.1 Move the incremental stream parser into `packages/shared`: relocate `packages/core/src/parser/events.ts` + `stream-parser.ts` + `stream-parser.test.ts` to `packages/shared/src/parser/`, and the six parser `.txt` fixtures + `stream-parser.fuzz.test.ts` to `packages/shared/test/` (provider SSE fixtures stay in core). Make `packages/core/src/parser/index.ts` re-export `@openartifact/shared`'s parser and export it from `packages/shared/src/index.ts`; update `providers/fallback.ts`/`prompts/system.ts` imports if needed. Verify `pnpm typecheck`, `pnpm lint` and `pnpm test` are green (shared + core, including the chunk-boundary fuzz test).
- [x] 1.2 Add the web artifact model in `apps/web/src/artifacts/`: a pure `parseDocument(content)` that feeds the accumulated assistant text through the shared `StreamParser` (push-all + end) and folds the events into text blocks, inline Mermaid blocks, and artifacts keyed by `identifier` with a `versions` list and an `incomplete` flag (a reused identifier appends a version; an in-progress version is updated in place), plus a `useArtifactStore` (Zustand) that derives artifacts from the last assistant message and tracks the selected artifact id. Verify unit tests for `parseDocument` (all five types, mermaid fence, reused identifier → new version, incomplete flag, idempotent re-parse) and the store's select/version-append behavior pass.

## 2. Vendor assets + sandbox runtime

- [x] 2.1 Add `scripts/vendor.mjs` (esbuild-bundles `react`, `react-dom`, `react/jsx-runtime`, `lucide-react`, `recharts` and `@tailwindcss/browser` into `apps/web/public/vendor/`), add the build deps to `apps/web`, and add the server `/vendor/*` route (serves the vendored files with `Access-Control-Allow-Origin: *`; dev reads `apps/web/public/vendor`, prod reads `apps/web/dist/vendor`). Verify `pnpm --filter @openartifact/server typecheck` passes and a server unit test asserts `/vendor/react.js` returns 200 with the CORS header.
- [x] 2.2 Add `apps/web/src/sandbox/` — the srcdoc template (import map pointing only at `/vendor/*`, module script, Tailwind runtime) and the postMessage error/console bridge (parent accepts only `event.source === iframe.contentWindow`) — plus `ReactPreview` (sucrase transpile → srcdoc) and `HtmlPreview`, each with one iframe per artifact, srcdoc replaced on update and blob URLs revoked. Verify unit tests for the srcdoc template/import map (only vendored specifiers, `sandbox="allow-scripts"` with no `allow-same-origin`) and `pnpm --filter @openartifact/web build` typechecks; `pnpm design:check` passes.

## 3. SVG / Code / Mermaid renderers

- [x] 3.1 Add `SvgViewer` (DOMPurify SVG-profile sanitize before inline render, export as SVG and PNG via canvas with a size cap) and `CodeViewer` (shiki highlight themed from the design tokens, language from the `language` attribute with a plain-text fallback, copy button). Verify unit tests (script stripped from SVG; copy) pass and `pnpm design:check` is clean.
- [x] 3.2 Add `MermaidViewer` and a shared `renderMermaid(source, theme)` helper (init `{ startOnLoad: false, securityLevel: "strict" }`, `parse()` before `render()` with a unique id per render, token-derived `themeVariables` for light/dark, zoom/pan/reset/copy-SVG/download-SVG/PNG controls, and a syntax-error state showing the source + message + offending line). Verify a unit test for theme mapping and the error state, plus `pnpm design:check`.

## 4. Artifact panel + inline Mermaid

- [x] 4.1 Build the `ArtifactPanel` (artifact switcher keyed by identifier+title, Preview/Code tabs, renderer dispatch by `artifactType` with unknown types falling back to Code, incomplete-streaming badge, and the existing empty state) wired to `useArtifactStore`. Verify `pnpm design:check` passes and `pnpm --filter @openartifact/web build` typechecks.
- [x] 4.2 Add `InlineMermaid` (renders only complete ```mermaid fences from parsed message content, 300 ms debounce, themed, inline syntax-error with offending line, "Open in panel" that lifts the source into a Mermaid artifact) and update `MessageItem`/`ChatContainer` to render parsed message content (text blocks + inline diagrams; artifact tags lifted out). Verify unit tests for the inline renderer (complete vs. incomplete fence, error state, open-in-panel) pass and `pnpm design:check` is clean.

## 5. e2e + screenshots

- [x] 5.1 Extend the fake provider fixture with a scripted turn streaming one of each artifact type (react, html, svg, mermaid, code) plus a valid and an invalid ```mermaid fence, and add `e2e/artifacts.spec.ts` asserting every type renders, the sandbox blocks access to `window.parent.document`, and the invalid diagram shows an inline error without crashing the message list. Verify `pnpm e2e` passes.
- [ ] 5.2 Extend `e2e/screenshots.spec.ts` to capture each artifact type and the Mermaid syntax-error state in both themes at desktop and mobile widths, and confirm `pnpm screenshots` writes them to `docs/screenshots/`. Verify `pnpm check` stays green end-to-end.
