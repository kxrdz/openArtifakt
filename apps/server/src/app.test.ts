import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("server app", () => {
  it("responds to /health with ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, name: "open-artifact" });
  });

});
