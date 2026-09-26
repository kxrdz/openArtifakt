import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 4318);

const app = createApp();

serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
  console.log(`OpenArtifact server listening on http://${HOST}:${info.port}`);
});
