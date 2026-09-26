# OpenArtifact: Product

## Audience
Software developers who want an AI coding assistant they control. They bring their own model (a hosted API or a local model via Ollama) and keep their code on their own machine. They are comfortable with terminals, git and code editors. They use it mostly on laptops and large monitors, and occasionally check progress from a phone-sized browser window.

## Purpose
Let a developer work with any LLM that can read, edit and run code in a local project, with every risky action visible and approvable. Generated React, HTML, SVG and Mermaid output appears live next to the conversation, so ideas can be seen and tried immediately.

## Operating context
- **Long sessions.** Users work for hours, next to an editor and a terminal, with split attention.
- **Glanceability.** At any moment the interface must answer three questions: what is the agent doing right now, what is waiting for me, and what changed.
- **Constant streaming.** Text, code, tool output and diagrams arrive progressively.
- **Theme.** Often used in dim rooms, so dark mode must be first-class. Light mode must be equally good.

## Constraints
- **Local-first.** Works offline with a local model. No font CDNs or remote assets at runtime; fonts are self-hosted.
- **Delivery.** Web UI served from localhost, responsive from 390 px wide up to ultra-wide monitors.
- **Accessibility.** WCAG 2.2 AA contrast, full keyboard operation, visible focus, and `prefers-reduced-motion` respected.
- **Identity.** Open source (MIT). It must not imitate or use the trademarks of any commercial AI product; it needs its own identity.
- **Stack.** React 18, Tailwind CSS, design tokens as CSS variables.

## Voice
- Plain, precise and calm: a competent colleague, not a mascot.
- Short labels. No hype, no exclamation marks, no emoji in the interface chrome.
- Errors say what happened and what to do next.
- Risky actions are named explicitly, e.g. "Run `rm -rf dist` in /project?", never euphemised.

## Evidence
- These are working assumptions for an early product. There are no users or analytics yet, so revisit this file after the first real feedback.
- Trust in coding agents comes from transparency: people approve changes when they can see the exact diff or command.
- This audience already lives in dense but calm tools (terminals, git clients, code editors). The app should sit comfortably beside them, not compete with them for attention.
