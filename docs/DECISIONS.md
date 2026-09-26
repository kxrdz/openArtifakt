# Decisions

Format: **Decision**: reason. *Alternatives considered.*

- **Local Hono server + Vite React UI instead of Next.js**: the app needs long-lived processes (shell execution, streaming, SQLite) on the user's machine; a local server makes that explicit, and the UI stays a plain client. *Next.js with a custom server.*
- **Sandboxed iframe with vendored libraries instead of Sandpack's hosted bundler**: works offline and never sends user code to a third party. *Sandpack, a self-hosted bundler.*
- **Code-first build path in Impeccable**: the run is unattended and has no image generation. *Comp-first.*
- **Jev commit-review agent (`jev-reviewer`)**: reviews git commits with Jev (TypeSafe's System One model) via `scripts/jev-review.mjs`, one TypeSafe request per commit carrying typed judgments (category, quality, security/bug/test risk, blocking). Chose direct HTTP (`fetch`) over `@typesafe-ai/sdk` so the script stays dependency-free and runs with `node` alone. *Using the official JS SDK; having Jev write free-form prose.*
