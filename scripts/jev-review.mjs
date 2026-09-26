#!/usr/bin/env node
/**
 * Review git commits with Jev (TypeSafe's System One model).
 *
 * Jev returns typed judgments (noul / choice / score) with probabilities,
 * not prose. This script gathers commits, sends each commit's message + diff
 * as `state` to the TypeSafe evaluation endpoint, and renders a structured
 * review report.
 *
 * Usage:
 *   node scripts/jev-review.mjs                 # review commits since last run (or last 10)
 *   node scripts/jev-review.mjs --range a..b    # review a specific revision range
 *   node scripts/jev-review.mjs --since <sha>   # review <sha>..HEAD
 *   node scripts/jev-review.mjs --count 5       # review the last 5 commits
 *   node scripts/jev-review.mjs --dry-run       # show what would be sent, no API call
 *   node scripts/jev-review.mjs --json          # emit raw JSON
 *
 * Requires TYPESAFE_API_KEY in the environment or in the repo's .env file.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const API_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const MAX_STATE_CHARS = 24_000; // keep under Jev's 32k state+longest-question budget
const DEFAULT_COUNT = 10;
const MAX_RETRIES = 3;
const MARKER_FILE = join(ROOT, ".jev-review-last");

// --- helpers ---------------------------------------------------------------

function usage() {
  process.stdout.write(`Review git commits with Jev (TypeSafe System One)

Usage:
  node scripts/jev-review.mjs [options]

Options:
  --range <a..b>   Review commits in a git revision range
  --since <sha>    Review commits from <sha> (exclusive) to HEAD
  --count <n>      Review the last <n> commits (default ${DEFAULT_COUNT})
  --dry-run        Print the payload that would be sent, without calling the API
  --json           Emit the raw structured result as JSON
  --help           Show this help

Requires TYPESAFE_API_KEY in the environment or in .env.
`);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat" },
  }).trim();
}

function gitLines(args) {
  const out = git(args);
  return out ? out.split("\n") : [];
}

function loadDotEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return {};
  const map = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function parseArgs(argv) {
  const opts = { json: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--json") opts.json = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--range") opts.range = argv[++i];
    else if (a === "--since") opts.since = argv[++i];
    else if (a === "--count") opts.count = Number(argv[++i]);
    else positional.push(a);
  }
  opts.positional = positional;
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoff(attempt) {
  return Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return (
    text.slice(0, head) +
    `\n\n[... ${text.length - max} characters truncated ...]\n\n` +
    text.slice(-tail)
  );
}

// --- Jev / TypeSafe --------------------------------------------------------

// Typed review judgments. Independent questions over the same state are
// evaluated in parallel by Jev in a single request.
const QUESTIONS = {
  category: {
    type: "choice",
    instructions: "What kind of change is this commit?",
    criteria: {
      feature: "Adds a new feature or capability",
      fix: "Fixes a bug or defect",
      refactor: "Restructures code without changing behavior",
      docs: "Documentation only",
      chore: "Build, tooling, or housekeeping",
      deps: "Dependency changes",
      revert: "Reverts a previous commit",
      other: "None of the above",
    },
  },
  quality: {
    type: "score",
    instructions:
      "Rate the overall quality of this commit: clarity, correctness, scope, and maintainability.",
    criteria: ["Unacceptable", "Poor", "Acceptable", "Good", "Excellent"],
  },
  risk_security: {
    type: "noul",
    instructions:
      "Does this change introduce a security vulnerability, leak secrets or credentials, or weaken authorization, validation, or sandboxing?",
    criteria: {
      true: "Introduces or fails to fix a security problem",
      false: "No security concern",
    },
  },
  risk_bug: {
    type: "noul",
    instructions:
      "Is there a meaningful risk that this change introduces a bug, regression, or broken behavior?",
    criteria: {
      true: "Likely bug or regression",
      false: "Low bug risk",
    },
  },
  has_tests: {
    type: "noul",
    instructions:
      "Does this change add or update automated tests for the behavior it modifies, or is it a pure docs/config change where tests do not apply?",
    criteria: {
      true: "Tests added/updated, or tests not applicable",
      false: "Code changed without tests",
    },
  },
  blocking: {
    type: "noul",
    instructions: "Should this commit be blocked from merging until it is revised?",
    criteria: {
      true: "Must fix before merge",
      false: "Can merge as-is",
    },
  },
};

async function callJev(state, { dryRun }) {
  const payload = { state, model: MODEL, questions: QUESTIONS };
  if (dryRun) return { payload };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new Error(`Network error calling TypeSafe: ${err.message}`);
    }

    if (res.status === 429 || res.status === 529) {
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      if (attempt < MAX_RETRIES) {
        await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      throw new Error(`TypeSafe ${res.status}: rate limited`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`TypeSafe API ${res.status}: ${text.slice(0, 400)}`);
    }

    return await res.json();
  }
  throw lastErr;
}

// --- commit gathering ------------------------------------------------------

function listCommitShas(opts) {
  if (opts.range) {
    return gitLines(["log", "--reverse", "--format=%H", opts.range]);
  }
  if (opts.since) {
    return gitLines(["log", "--reverse", "--format=%H", `${opts.since}..HEAD`]);
  }
  if (opts.count) {
    return gitLines(["log", "--reverse", "-n", String(opts.count), "--format=%H", "HEAD"]);
  }
  // default: commits since the last review, else the last DEFAULT_COUNT commits
  if (existsSync(MARKER_FILE)) {
    const marker = readFileSync(MARKER_FILE, "utf8").trim();
    if (marker && isCommit(marker)) {
      return gitLines(["log", "--reverse", "--format=%H", `${marker}..HEAD`]);
    }
  }
  return gitLines(["log", "--reverse", "-n", String(DEFAULT_COUNT), "--format=%H", "HEAD"]);
}

function isCommit(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function buildCommitState(sha) {
  const meta = git(["log", "-1", `--format=%H%n%an <%ae>%n%ad%n%B`, "--date=iso", sha]);
  const [fullSha, author, date, ...messageLines] = meta.split("\n");

  const stat = git(["show", "--stat", "--format=", "--no-color", sha]);
  const diff = git(["show", "--format=", "--no-color", "--no-ext-diff", sha]);

  const state = [
    `Commit: ${fullSha}`,
    `Author: ${author}`,
    `Date: ${date}`,
    ``,
    `Message:`,
    messageLines.join("\n").trim(),
    ``,
    `Changed files:`,
    stat,
    ``,
    `Diff:`,
    diff,
  ].join("\n");

  return { sha: fullSha, subject: messageLines[0] || fullSha.slice(0, 7), state };
}

// --- rendering -------------------------------------------------------------

const pct = (p) => `${(Number(p) * 100).toFixed(0)}%`;

function summarize(answer) {
  switch (answer.type) {
    case "noul":
      return { text: pct(answer.noul), detail: `yes ${pct(answer.noul)}` };
    case "choice":
      return {
        text: answer.choice,
        detail: `${answer.choice} (conf ${pct(answer.confidence)})`,
      };
    case "score": {
      const level = Math.round(answer.score);
      const label = answer.legend?.[String(level)] ?? String(answer.score);
      const max = Object.keys(answer.legend ?? {}).length - 1;
      return {
        text: label,
        detail: `${answer.score.toFixed(1)}/${max} ${label} (conf ${pct(answer.confidence)})`,
      };
    }
    default:
      return { text: "", detail: "" };
  }
}

function renderMarkdown(results, { rangeLabel }) {
  const lines = [];
  lines.push(`# Commit Review — Jev (TypeSafe System One)`);
  lines.push("");
  lines.push(`Reviewed ${results.length} commit${results.length === 1 ? "" : "s"}${rangeLabel ? ` (${rangeLabel})` : ""}.`);
  lines.push("");

  const blocking = results.filter((r) => r.answers.blocking.noul >= 0.6);
  const security = results.filter((r) => r.answers.risk_security.noul >= 0.6);

  if (blocking.length) {
    lines.push("## Blocking (must fix)");
    lines.push("");
    for (const r of blocking) {
      lines.push(`- \`${r.sha.slice(0, 7)}\` — ${r.subject} (${pct(r.answers.blocking.noul)})`);
    }
    lines.push("");
  }

  if (security.length) {
    lines.push("## Security concerns");
    lines.push("");
    for (const r of security) {
      lines.push(`- \`${r.sha.slice(0, 7)}\` — ${r.subject} (${pct(r.answers.risk_security.noul)})`);
    }
    lines.push("");
  }

  lines.push("## Summary table");
  lines.push("");
  lines.push("| commit | category | quality | tests | bug risk | security | blocking |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const q = r.answers.quality;
    const level = Math.round(q.score);
    const label = q.legend?.[String(level)] ?? String(q.score);
    lines.push(
      `| \`${r.sha.slice(0, 7)}\` | ${r.answers.category.choice} | ${label} | ${pct(r.answers.has_tests.noul)} | ${pct(r.answers.risk_bug.noul)} | ${pct(r.answers.risk_security.noul)} | ${pct(r.answers.blocking.noul)} |`,
    );
  }
  lines.push("");

  lines.push("## Details");
  lines.push("");
  for (const r of results) {
    lines.push(`### \`${r.sha.slice(0, 7)}\` — ${r.subject}`);
    lines.push("");
    for (const [key, q] of Object.entries(r.answers)) {
      const s = summarize(q);
      lines.push(`- **${key}**: ${s.detail}`);
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  const bad = blocking.length + security.length;
  const qualityAvg = (
    results.reduce((sum, r) => sum + r.answers.quality.score, 0) / (results.length || 1)
  ).toFixed(1);
  lines.push(
    `${results.length} commit(s) reviewed, average quality ${qualityAvg}/4. ` +
      `${blocking.length} blocking, ${security.length} security concern(s).`,
  );
  lines.push("");

  return lines.join("\n");
}

function renderJson(results, { rangeLabel, model }) {
  return JSON.stringify(
    { range: rangeLabel ?? null, model, commits: results },
    null,
    2,
  );
}

// --- main ------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const env = { ...process.env, ...loadDotEnv() };
  globalThis.API_KEY = env.TYPESAFE_API_KEY;

  if (!API_KEY && !opts.dryRun) {
    process.stderr.write(
      "error: TYPESAFE_API_KEY is not set.\n" +
        "Add it to .env (TYPESAFE_API_KEY=...) or export it, then re-run.\n" +
        "Get a key at https://typesafe.ai — see https://docs.typesafe.ai/api\n",
    );
    process.exit(1);
  }

  const shas = listCommitShas(opts);
  if (shas.length === 0 || (shas.length === 1 && !shas[0])) {
    process.stdout.write("Nothing to review — no unreviewed commits found.\n");
    process.exit(0);
  }

  const commits = shas.map(buildCommitState);
  const rangeLabel = opts.range ?? (opts.since ? `${opts.since}..HEAD` : `${shas[0].slice(0, 7)}..${shas[shas.length - 1].slice(0, 7)}`);

  if (opts.dryRun) {
    process.stdout.write(
      `Dry run — ${commits.length} commit(s) would be reviewed against Jev (${MODEL}).\n` +
        `API key: ${API_KEY ? "found" : "MISSING (set TYPESAFE_API_KEY)"}\n\n`,
    );
    for (const c of commits) {
      process.stdout.write(
        `--- ${c.sha.slice(0, 7)} ${c.subject}\n${truncate(c.state, 800)}\n\n`,
      );
    }
    process.stdout.write(`Questions (sent once per commit):\n${JSON.stringify(QUESTIONS, null, 2)}\n`);
    process.exit(0);
  }

  const results = [];
  let model;
  for (const c of commits) {
    process.stderr.write(`Reviewing ${c.sha.slice(0, 7)} ${c.subject}...\n`);
    const state = truncate(c.state, MAX_STATE_CHARS);
    const resp = await callJev(state, opts);
    model = resp.model;
    results.push({ sha: c.sha, subject: c.subject, answers: resp.answers });
  }

  if (opts.json) {
    process.stdout.write(renderJson(results, { rangeLabel, model }) + "\n");
  } else {
    process.stdout.write(renderMarkdown(results, { rangeLabel }) + "\n");
  }

  // Record progress only for default/since/count flows (reachable from HEAD).
  if (!opts.range) {
    writeFileSync(MARKER_FILE, results[results.length - 1].sha + "\n");
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
