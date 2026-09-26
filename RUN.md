# Running the build with Pi

## What you need in Pi
Pi's core deliberately leaves out subagents, plan mode, permission prompts, MCP and to-do lists. This kit is designed around that, so the list of things to install is short.

| Piece | Needed? | How |
|---|---|---|
| **Impeccable skill** | **Required** | `bootstrap.sh` runs `npx impeccable install --providers=pi --scope=project`, which installs it into `.pi/skills/`. |
| **Long-run loop** | **Required, included** | `loop.sh` runs Pi in print mode, one fresh session per step, until `PROGRESS.md` says `Status: DONE`. No extension needed. |
| **Web access** | Recommended | `pi install npm:pi-web-access` lets the agent look up current library docs when a version has changed. |
| **Ralph loop extension** | Optional alternative to `loop.sh` | `pi install git:github.com/edxeth/pi-ralph-loop` if you prefer running the loop inside Pi's UI. Use the contents of `PROMPT.md` as the loop prompt. |
| Subagent extension | Not needed | The spec uses fresh sessions per step instead. |
| Permission extension | Not needed; use a container instead | A permission gate would pause an unattended run. |

Pi packages can run arbitrary code, so review a third-party package before you install it.

## 1. Prerequisites
You need:
- **Node.js 22 LTS.**
- **git.**
- **pnpm.** `bootstrap.sh` enables it via corepack if it's missing.
- **Native build tools** for SQLite:
  - macOS: `xcode-select --install`
  - Linux / WSL: `build-essential` and `python3`
- **Network access** during the build.
- **Pi**: `curl -fsSL https://pi.dev/install.sh | sh`, or `npm install -g @earendil-works/pi-coding-agent`.

Then start `pi` once to set it up:
1. Log in with `/login`, or export your provider's API key in the shell.
2. Pick a model with `/model`. Choose a strong coding model **that accepts images**, so it can review the UI screenshots.

On Windows, do everything inside **WSL2**.

## 2. Safety first
Pi has no permission prompts: every file write and shell command runs immediately, with your user's rights. Run this build inside a **VM, a dev container, or a separate user account** that has no access to your SSH keys, cloud credentials or other projects.

## 3. Bootstrap (once)
```bash
cd open-artifact
./bootstrap.sh
```
This does four things:
1. Checks the prerequisites.
2. Runs `git init`.
3. Creates `.env` from `.env.example`.
4. Installs Impeccable for Pi, then commits.

Optional: put a provider key into `.env`, or run Ollama. That file is for the *app you're building* (`pnpm smoke`); Pi itself doesn't read it. Without keys the build still works on recorded fixtures, and the smoke test is listed as Blocked.

Recommended: start `pi` in the folder, run `/skill:impeccable init`, and let it confirm the pre-written `PRODUCT.md`. Answer any remaining question, then quit. This takes about two minutes and removes the only interactive step.

## 4. Start the loop
```bash
./loop.sh                          # uses Pi's default model
./loop.sh --model <your-model>     # or pass any extra pi flags
```

What the loop does:
- **Each iteration** is a fresh Pi session. It reads `AGENTS.md`, the spec and `PROGRESS.md`, completes one step, runs `pnpm check`, updates `PROGRESS.md` and commits.
- **It stops** when `PROGRESS.md` says `Status: DONE`, after 3 iterations in a row without a commit, or after 40 iterations. You can change the limits: `MAX_ITER=60 STALL_LIMIT=4 ./loop.sh`.
- **Logs** for every iteration are saved in `.loop-logs/`.
- **To continue after any stop**, fix the cause if there is one, then run `./loop.sh` again. The repo is the memory, so nothing is lost.

## 5. While it runs
- Watch `docs/PROGRESS.md` and `git log --oneline`.
- Don't edit files while an iteration is running.
- If the loop stops on stalls, read the **Blocked** and **Next** sections in `docs/PROGRESS.md` and the last log. Usually a key, a system package, or a step that is too big is the cause.

## 6. Realistic expectations
- Expect roughly 10–25 iterations and several hours in total.
- Cost depends heavily on the model you choose. Cheaper models are fine for steps 1–4 and 10. Use your best vision-capable model for the design steps (5 and 9), which you can do by stopping the loop and restarting it with a different `--model`.

## 7. Afterwards
- Check `docs/PROGRESS.md` for anything under **Blocked**.
- Start the app with `pnpm dev`.
- Look through `docs/screenshots/`.
