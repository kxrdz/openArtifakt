import * as path from "node:path";

/**
 * Secret-file detection (§9 "Secrets"). Reading a file whose basename matches
 * one of these patterns always requires explicit approval, even in Full auto,
 * because the content is sent to a third-party provider.
 */

const SECRET_PATTERNS: RegExp[] = [
  /^\.env/, // .env, .env.local, .env.production, …
  /\.pem$/, // *.pem
  /\.key$/, // *.key
  /^id_rsa/, // id_rsa, id_rsa.pub, …
];

/**
 * True when `filePath`'s basename matches a secret-file pattern (`.env*`,
 * `*.pem`, `*.key`, `id_rsa*`).
 */
export function isSecretPath(filePath: string): boolean {
  const base = path.basename(filePath);
  return SECRET_PATTERNS.some((pattern) => pattern.test(base));
}
