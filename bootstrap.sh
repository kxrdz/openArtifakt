#!/usr/bin/env bash
# Prepares this folder for the one-shot build. Run once from the project root.
# macOS / Linux / WSL2. On Windows, run it inside WSL2.
set -euo pipefail
cd "$(dirname "$0")"

missing=0
check() { # check <command> <how to install>
  if command -v "$1" >/dev/null 2>&1; then echo "  ok   $1"; else echo "  MISSING  $1  ->  $2"; missing=1; fi
}

echo "Checking prerequisites..."
check node   "install Node.js 22 LTS (https://nodejs.org or nvm)"
check git    "install git"
check pi     "curl -fsSL https://pi.dev/install.sh | sh   (or: npm install -g @earendil-works/pi-coding-agent)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm not found, enabling it via corepack..."
  corepack enable && corepack prepare pnpm@latest --activate || { echo "  MISSING  pnpm  ->  npm install -g pnpm"; missing=1; }
else
  echo "  ok   pnpm"
fi
command -v rg >/dev/null 2>&1 && echo "  ok   rg" || echo "  (optional) ripgrep not found; the app falls back to a slower JS search"

if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -lt 20 ]; then echo "  Node $major is too old; need 20+ (22 LTS recommended)"; missing=1; fi
fi

# Native build tools for better-sqlite3
case "$(uname -s)" in
  Darwin) xcode-select -p >/dev/null 2>&1 && echo "  ok   Xcode command line tools" \
            || { echo "  MISSING  build tools  ->  xcode-select --install"; missing=1; } ;;
  Linux)  { command -v g++ >/dev/null 2>&1 && command -v make >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; } \
            && echo "  ok   g++ / make / python3" \
            || { echo "  MISSING  build tools  ->  sudo apt install -y build-essential python3"; missing=1; } ;;
esac

if [ "$missing" -ne 0 ]; then
  echo; echo "Install the missing items above, then run ./bootstrap.sh again."; exit 1
fi

echo; echo "Initialising git..."
[ -d .git ] || git init -b main >/dev/null
[ -f .env ] || cp .env.example .env

# Enable the committed git hooks (e.g. .githooks/pre-commit and .githooks/pre-push run the Jev reviewer).
git config core.hooksPath .githooks

echo; echo "Installing the Impeccable skill for Pi (into .pi/skills)..."
npx -y impeccable install --providers=pi --scope=project

git add -A
git commit -qm "Bootstrap: spec, product context, agent instructions, Impeccable" || true

cat << 'MSG'

Done. Next steps:
  1. Make sure Pi is logged in / has a model: run `pi`, use /login or /model, then quit.
  2. Optional: add a provider key to .env (for the app itself, not for Pi) or start Ollama.
  3. Recommended: in `pi`, run `/skill:impeccable init` and confirm it picked up PRODUCT.md.
  4. Start the loop: ./loop.sh   (see RUN.md)
MSG
