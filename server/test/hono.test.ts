import { describe, expect, it } from "bun:test";
import { RequestStore } from "../src/frame/hono";
import {
  createBaseHono,
  requestContext,
  requestLogger,
} from "../src/frame/hono";
import type { Log } from "../src/frame/logger";

interface LogEntry {
  readonly message: unknown;
  readonly fields?: Log.Fields;
}

describe("Hono request pipeline", () => {
  it("logs the route template, final status, and approved context", async () => {
    const entries: LogEntry[] = [];
    const logger: Pick<Log.Logger, "info"> = {
      info(message, fields) {
        entries.push({ message, fields });
      },
    };
    const app = createBaseHono();
    app.use("*", requestContext);
    app.use("*", requestLogger({ logger }));
    app.get("/users/:id", (context) => {
      RequestStore.set("tenantId", "tenant-1");
      RequestStore.set("uid", "user-1");
      RequestStore.set("authType", "SESSION");
      return context.json({ id: context.req.param("id") });
    });
    app.get("*", (context) => context.notFound());

    const response = await app.request(
      "/users/user-2?access_token=secret",
      {
        headers: {
          "x-request-id": "request-1",
          authorization: "Bearer secret",
          cookie: "sid=secret",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(entries).toEqual([
      {
        message: "HTTP request completed",
        fields: {
          method: "GET",
          route: "/users/:id",
          status: 200,
          durationMillis: expect.any(Number),
          requestId: "request-1",
          tenantId: "tenant-1",
          uid: "user-1",
          authType: "SESSION",
        },
      },
    ]);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("user-2");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("sid=secret");
  });
});
