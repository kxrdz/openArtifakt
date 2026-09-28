import { existsSync, statSync } from "node:fs";
import * as path from "node:path";

export interface EnvOptions {
  cwd?: string;
  envPath?: string;
}

export interface AutoLoadEnvResult {
  loaded: boolean;
  path?: string;
}

/**
 * Searches for a `.env` file starting at `cwd` (or `process.cwd()`),
 * traversing ancestor directories upward until found or until stopped by a
 * boundary (`.git`, `pnpm-workspace.yaml`, or the filesystem root).
 *
 * If `envPath` (or `OPENARTIFACT_ENV_FILE`) is provided, resolves and checks that path directly.
 */
export function findEnvFile(options?: EnvOptions | string): string | undefined {
  const opts: EnvOptions = typeof options === "string" ? { cwd: options } : (options ?? {});

  const explicit = opts.envPath ?? process.env.OPENARTIFACT_ENV_FILE;
  if (explicit) {
    const resolved = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(opts.cwd ?? process.cwd(), explicit);
    try {
      if (existsSync(resolved) && statSync(resolved).isFile()) {
        return resolved;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  let current = path.resolve(opts.cwd ?? process.cwd());

  while (true) {
    const candidate = path.join(current, ".env");
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Continue search on filesystem error reading candidate
    }

    // Boundary conditions: stop search at git repository root or workspace root
    if (
      existsSync(path.join(current, ".git")) ||
      existsSync(path.join(current, "pnpm-workspace.yaml"))
    ) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return undefined;
}

/**
 * Automatically locates and loads the `.env` file into `process.env` using
 * Node.js's native `process.loadEnvFile`.
 *
 * Preserves pre-existing environment variables (native Node behavior).
 * Returns `{ loaded: true, path }` if a `.env` file was found and loaded,
 * or `{ loaded: false }` if no `.env` file exists or if loading failed gracefully.
 */
export function autoLoadEnv(options?: EnvOptions | string): AutoLoadEnvResult {
  const envPath = findEnvFile(options);
  if (!envPath) {
    return { loaded: false };
  }

  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
      return { loaded: true, path: envPath };
    } catch {
      return { loaded: false, path: envPath };
    }
  }

  return { loaded: false, path: envPath };
}
