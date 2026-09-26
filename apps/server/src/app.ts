import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const SERVER_NAME = "open-artifact";
const SERVER_VERSION = "0.1.0";
const VITE_DEV_ORIGIN = "http://127.0.0.1:5173";

/**
 * The built web client lives in `apps/web/dist`; resolve it relative to this
 * file so the path works both from `src/` (tsx) and from `dist/` (tsc output).
 */
const WEB_DIST = fileURLToPath(new URL("../../web/dist/", import.meta.url));

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }),
  );

  const isProduction = process.env.NODE_ENV === "production";
  const webIndex = join(WEB_DIST, "index.html");
  const serveWebBuild = isProduction && existsSync(webIndex);

  if (serveWebBuild) {
    app.use("*", serveStatic({ root: WEB_DIST }));
    // SPA fallback: serve index.html for any client-side route.
    app.get("*", async (c) => c.html(await readFile(webIndex, "utf-8")));
  } else {
    // Development: proxy everything to the Vite dev server.
    app.all("*", async (c) => {
      if (isProduction) {
        return c.text("Web build not found. Run `pnpm build` first.", 503);
      }
      const incoming = new URL(c.req.url);
      const target = new URL(incoming.pathname + incoming.search, VITE_DEV_ORIGIN);
      const headers = new Headers(c.req.raw.headers);
      headers.delete("host");
      headers.delete("connection");
      let upstream: Response;
      try {
        upstream = await fetch(target, {
          method: c.req.method,
          headers,
          body:
            c.req.method === "GET" || c.req.method === "HEAD"
              ? undefined
              : await c.req.raw.arrayBuffer(),
          redirect: "manual",
        });
      } catch {
        return c.text("Vite dev server is not running. Run `pnpm dev` from the repo root.", 502);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    });
  }

  return app;
}
