#!/usr/bin/env node
/**
 * Vendors the dependencies consumed inside the sandboxed artifact iframe.
 *
 * The preview iframe runs with `sandbox="allow-scripts"` and an opaque origin,
 * so it can only load ES modules over CORS from the local server. This script
 * builds the modules the srcdoc import map references — `react`, `react-dom`,
 * `react/jsx-runtime`, `lucide-react` and `recharts` — into
 * `apps/web/public/vendor/` (Vite copies `public/` into `dist/`, so the
 * production build carries them too), and copies the prebuilt Tailwind browser
 * runtime alongside them. The server serves `/vendor/*` with
 * `Access-Control-Allow-Origin: *` (§6 / §12.7).
 *
 * All five bundles come from a single esbuild build with `splitting: true`, so
 * `react`, `react-dom` and `react/jsx-runtime` share one React module instance
 * (React's module-level state — the hook dispatcher above all — must not be
 * duplicated, or hooks break). The entry shims re-export the CJS packages'
 * named exports explicitly: esbuild cannot statically enumerate named exports
 * of a CommonJS module for `export *`, so the entry files name them. Entries
 * are written to a temp dir under `apps/web` (so bare specifiers resolve from
 * `apps/web/node_modules`) and removed afterwards. `@tailwindcss/browser`
 * ships a single prebuilt, dependency-free global bundle, so it is copied
 * verbatim rather than re-bundled.
 */
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(repoRoot, "apps", "web");
const outDir = join(webDir, "public", "vendor");

// esbuild is a devDependency of apps/web; resolve it from there so this script
// works no matter where pnpm hoists it.
const requireFromWeb = createRequire(join(webDir, "package.json"));
const esbuild = requireFromWeb("esbuild");

/**
 * Entry shims. Named exports must be enumerated explicitly because esbuild
 * cannot statically re-export named bindings of a CommonJS module via
 * `export *` (it would emit only a runtime `__reExport` that native ESM never
 * sees). ESM packages (`lucide-react`, `recharts`) re-export with `export *`.
 */
const entries = [
  {
    name: "react",
    source: `export {\n  act, Children, cloneElement, Component, createContext, createElement,\n  createFactory, createRef, forwardRef, Fragment, isValidElement, lazy, memo,\n  Profiler, PureComponent, startTransition, StrictMode, Suspense, unstable_act,\n  useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId,\n  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer,\n  useRef, useState, useSyncExternalStore, useTransition, version,\n} from "react";\nimport React from "react";\nexport default React;\n`,
  },
  {
    name: "react-jsx-runtime",
    source: `export { Fragment, jsx, jsxs } from "react/jsx-runtime";\n`,
  },
  {
    name: "react-dom",
    source: `export {\n  createPortal, createRoot, findDOMNode, flushSync, hydrate, hydrateRoot, render,\n  unmountComponentAtNode, unstable_batchedUpdates, unstable_renderSubtreeIntoContainer,\n  version,\n} from "react-dom";\nimport ReactDOM from "react-dom";\nexport default ReactDOM;\n`,
  },
  {
    name: "lucide-react",
    source: `export * from "lucide-react";\n`,
  },
  {
    name: "recharts",
    source: `export * from "recharts";\n`,
  },
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entryDir = await mkdtemp(join(webDir, ".vendor-entries-"));
try {
  const entryPoints = {};
  for (const { name, source } of entries) {
    const file = join(entryDir, `${name}.mjs`);
    await writeFile(file, source);
    entryPoints[name] = file;
  }

  await esbuild.build({
    entryPoints,
    outdir: outDir,
    entryNames: "[name]",
    chunkNames: "chunk-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    define: { "process.env.NODE_ENV": '"production"' },
    external: [],
    minify: true,
    sourcemap: false,
    legalComments: "eof",
    logLevel: "silent",
    absWorkingDir: webDir,
  });
} finally {
  await rm(entryDir, { recursive: true, force: true });
}

// Tailwind's browser build is a single prebuilt global script.
const tailwindEntry = requireFromWeb.resolve("@tailwindcss/browser");
await copyFile(tailwindEntry, join(outDir, "tailwind-browser.js"));

const files = (await readdir(outDir)).sort();
for (const name of files) {
  const { size } = await stat(join(outDir, name));
  console.log(`  vendor/${name}  ${(size / 1024).toFixed(1)} kB`);
}
console.log(`Vendored ${files.length} files into apps/web/public/vendor/`);
