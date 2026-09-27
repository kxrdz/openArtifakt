# Proposal

## Why

Steps 1–6 built the engine and the chat surface, but every assistant message still renders as a plain-text blob: `<artifact>` blocks and ```mermaid fences stream as literal text, the right-hand panel only shows the empty state, and there is no way to see a React component, an HTML page, an SVG, a diagram or a highlighted code file the model produced. Artifacts and live diagrams are one of the three core capabilities of the product (§1), so this step turns parsed model output into rendered, sandboxed previews next to the conversation.

## What Changes

- **Move the incremental stream parser into `packages/shared`** so the web client can parse assistant text the same way the server/adapters already do (the web must not import `packages/core`). `packages/core` re-exports it unchanged, so existing parser/fallback/fuzz tests keep passing.
- **Add a client-side artifact model and store** (`apps/web`): parse each assistant message's accumulated text into text blocks, inline Mermaid blocks and artifacts, keyed by `identifier` with a version list (a reused identifier appends a version, it never replaces history), and track which artifact is open in the panel.
- **Add the artifact renderers** for the five types: a sandboxed React preview (transpiled TSX + import map + vendored ESM + Tailwind runtime), a sandboxed HTML preview, a sanitized SVG viewer with export, a themed Mermaid viewer with zoom/pan/copy/download, and a syntax-highlighted Code viewer with copy.
- **Add the sandbox runtime** (`apps/web/src/sandbox`): one `<iframe sandbox="allow-scripts" srcdoc>` per artifact (never `allow-same-origin`), `postMessage`-only communication with `event.source` validation, and a runtime-error/console bridge with a "Send error to agent" action.
- **Add a local `/vendor` route** on the server (CORS `*` for the opaque iframe origin) serving vendored ESM builds of `react`, `react-dom`, `lucide-react`, `recharts` and the Tailwind browser runtime, generated offline by a build script.
- **Add inline Mermaid in chat**: complete ```mermaid fences render debounced (300 ms) and themed from the tokens, syntax errors show the source and offending line without crashing the message list, and an "Open in panel" action lifts a diagram into a Mermaid artifact.
- **Add e2e + screenshots** for every artifact type and the Mermaid error state, via the existing key-free fake provider (its fixture gains a turn that streams all five artifact types plus an invalid diagram).

## Capabilities

### New Capabilities

- `artifact-rendering`: the artifact panel — the five renderers (React, HTML, SVG, Mermaid, Code), the sandbox iframe runtime and error bridge, the vendored-dependency `/vendor` route + import map, Preview/Code tabs, and the artifact switcher.
- `inline-mermaid`: inline Mermaid diagrams in the chat message stream — fence parsing, debounced complete-block rendering, theme derivation from the design tokens, syntax-error display, and the "Open in panel" lift into a Mermaid artifact.

### Modified Capabilities

- `chat-ui`: assistant messages change from rendering plain pre-wrapped text to rendering parsed content — inline Mermaid blocks render as diagrams, and artifact content is lifted out of the message into the artifact panel rather than shown as literal tags.

## Impact

- `packages/shared`: gains `src/parser/` (the `StreamParser`, `ParserEvent` types and their tests, moved verbatim from `packages/core`); `index.ts` re-exports it.
- `packages/core`: `src/parser/` becomes a thin re-export of `@openartifact/shared`'s parser so `providers/fallback.ts`, the system prompt and the parser/fuzz tests keep their imports; `packages/core/test/stream-parser.*` tests move to `packages/shared`.
- `apps/web`: new `artifacts/` (model + store + document reducer), `components/artifacts/` (panel, React/HTML/SVG/Mermaid/Code viewers, sandbox), `sandbox/` (iframe runtime + error bridge), and message parsing in `chat/`. Adds `mermaid`, `dompurify`, `shiki`, `sucrase` runtime deps (code-split via dynamic import) and `esbuild`, `lucide-react`, `recharts`, `@tailwindcss/browser` build deps for the vendor bundle.
- `apps/server`: a `/vendor/*` route serving the vendored ESM with `Access-Control-Allow-Origin: *` (dev reads `apps/web/public/vendor`, prod reads the built `dist/vendor`).
- `apps/server/src/fake`: the scripted fixture gains a turn streaming all five artifact types plus an invalid Mermaid block, so e2e and screenshots stay key-free.
- `e2e`: new `artifacts.spec.ts` (every type renders, sandbox isolation, invalid Mermaid) and screenshots for each artifact type + the Mermaid error state.
- No changes to the provider adapters, the agent loop, or the tool implementations.
