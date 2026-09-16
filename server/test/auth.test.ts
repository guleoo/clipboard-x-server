import { afterEach, describe, expect, it } from "bun:test";
import { sign } from "hono/jwt";
import { Provider, Result } from "../src/frame/core";
import { createApp, createHono, mountRoutes } from "../src/frame/hono";
import {
  SecurityConfig,
  SecurityFrameService,
} from "../src/frame/security";
import { framePath } from "./frame-path";

afterEach(() => Provider.unprovide(SecurityFrameService));

describe("auth capability", () => {
  it("protects createHono while preserving createPublicHono", async () => {
    Provider.provide(SecurityFrameService, {
      async resolveSession({ payload }) {
        return payload.uid ? { uid: payload.uid, authType: "SESSION" } : undefined;
      },
      async hasPermission() {
        return true;
      },
    }, { override: true });
    const routes = createHono("/private");
    routes.get("/", (context) => context.json(Result.data({ ok: true })));
    const app = createApp();
    mountRoutes(app, [routes]);

    expect((await app.request(framePath("/private"))).status).toBe(401);
    const token = await sign(
      { uid: "user-1", type: "access", exp: Math.floor(Date.now() / 1_000) + 60 },
      SecurityConfig.jwtSecret!,
      SecurityConfig.jwtAlgorithm,
    );
    expect((await app.request(framePath("/private"), {
      headers: { Authorization: `Bearer ${token}` },
    })).status).toBe(200);
  });
});
