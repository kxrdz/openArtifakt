# artifact-rendering Specification

## Purpose
Renders model-produced artifacts of five types — React, HTML, SVG, Mermaid and code — in a side panel next to the conversation, with sandboxed live previews, syntax-highlighted code and locally served dependencies so previews work offline.

## Requirements

### Requirement: Artifact panel with switcher and tabs

The system SHALL show the currently open artifact in a panel with an artifact switcher (one entry per distinct identifier) and Preview/Code tabs. When an artifact streams, the Code tab SHALL update live; the Preview SHALL build when the artifact closes.

#### Scenario: Artifact appears in the switcher
- **WHEN** the model emits an `<artifact>` block with a new identifier
- **THEN** the identifier appears in the switcher and its content opens in the panel

#### Scenario: Code updates live, preview builds on close
- **WHEN** an artifact is streaming and its code changes
- **THEN** the Code tab updates in place; the Preview is built once the artifact closes

#### Scenario: Unknown type renders as code
- **WHEN** an artifact declares a `type` that is not one of the five known types
- **THEN** the artifact renders in the Code tab as a code file

### Requirement: Sandboxed React preview

The system SHALL render `application/vnd.react` artifacts as a single-file React component with a default export, transpiled in the browser and loaded in a sandboxed iframe that resolves only the vendored imports (react, react-dom, lucide-react, recharts) and includes the Tailwind runtime. An unknown import SHALL show a clear error message, not a blank screen.

#### Scenario: React artifact renders
- **WHEN** a valid React artifact closes
- **THEN** the Preview tab shows the rendered component

#### Scenario: Unknown import shows an error
- **WHEN** a React artifact imports a module that is not vendored
- **THEN** the preview shows a clear error naming the unknown import

### Requirement: Sandboxed HTML preview

The system SHALL render `text/html` artifacts as a complete document inside a sandboxed iframe.

#### Scenario: HTML artifact renders
- **WHEN** an HTML artifact closes
- **THEN** the Preview tab shows the document rendered in the sandbox

### Requirement: Sandbox isolation

Every React and HTML preview SHALL run in an `<iframe sandbox="allow-scripts">` with no `allow-same-origin`, one iframe per artifact whose `srcdoc` is replaced on update (never accumulating iframes), and the preview SHALL NOT be able to reach the parent document.

#### Scenario: Preview cannot access the parent document
- **WHEN** preview code attempts to read `window.parent.document`
- **THEN** the access is blocked by the sandbox and no parent data is exposed

#### Scenario: Communication is postMessage-only
- **WHEN** the parent receives a `message` event
- **THEN** it is accepted only when `event.source` is the artifact iframe's `contentWindow`

### Requirement: SVG viewer with sanitization and export

The system SHALL render `image/svg+xml` artifacts after sanitizing with an SVG profile, and SHALL offer export as SVG and PNG.

#### Scenario: Unsafe SVG is neutralized
- **WHEN** an SVG artifact contains a script element
- **THEN** the script is stripped before the SVG is shown

#### Scenario: Export SVG and PNG
- **WHEN** the user exports a rendered SVG
- **THEN** an SVG download and a PNG download (via canvas) are produced

### Requirement: Themed Mermaid viewer with controls

The system SHALL render `application/vnd.mermaid` artifacts with Mermaid initialized with `startOnLoad: false` and `securityLevel: "strict"`, validating with `parse()` before `render()` using a unique id per render. Diagram colors SHALL derive from the active theme's design tokens, and the viewer SHALL offer zoom, pan, reset view, copy SVG, and download as SVG or PNG.

#### Scenario: Valid diagram renders themed
- **WHEN** a valid Mermaid artifact opens
- **THEN** the diagram renders with colors matching the active theme

#### Scenario: Invalid diagram shows the error
- **WHEN** a Mermaid artifact fails to parse
- **THEN** the viewer shows the source with the error message and the offending line highlighted, and the app does not crash

### Requirement: Syntax-highlighted code viewer

The system SHALL render `application/vnd.code` artifacts (and any unknown-type artifact) with syntax highlighting themed from the design tokens, and SHALL offer a copy button.

#### Scenario: Code is highlighted and copyable
- **WHEN** a code artifact opens
- **THEN** its source is highlighted for its declared language and the copy button copies the full source

### Requirement: Runtime error bridge

The system SHALL capture iframe runtime errors, unhandled rejections and console output from a preview and show them below the preview with a "Send error to agent" action.

#### Scenario: Preview error surfaces with a send action
- **WHEN** a React or HTML preview throws at runtime
- **THEN** the error is shown below the preview with a "Send error to agent" action

### Requirement: Local vendor route

The server SHALL serve the vendored ESM builds (react, react-dom, lucide-react, recharts, Tailwind runtime) under `/vendor` with `Access-Control-Allow-Origin: *`, so sandboxed previews with an opaque origin can load them offline.

#### Scenario: Vendored module is served with CORS
- **WHEN** a preview requests a vendored module under `/vendor`
- **THEN** the server returns it with `Access-Control-Allow-Origin: *`

### Requirement: Version dropdown and version selection

The system SHALL let the user select any stored version of an artifact from a dropdown in the artifact panel, and SHALL render the selected version's content.

#### Scenario: Select an older version
- **WHEN** an artifact has multiple versions and the user picks an older one from the version dropdown
- **THEN** the panel shows that version's content without removing the newer versions

### Requirement: Diff between any two versions

The system SHALL diff any two versions of an artifact side by side in a Monaco diff editor.

#### Scenario: Compare two versions
- **WHEN** the user chooses two versions to compare
- **THEN** a diff editor shows the differences between them, with the two versions identified

### Requirement: Revert creates a new version

The system SHALL offer a revert action that copies an older version's content forward as a new version, and SHALL never delete history.

#### Scenario: Revert appends rather than deletes
- **WHEN** the user reverts an artifact to an older version
- **THEN** a new version is appended containing the older content, and every prior version remains listed
