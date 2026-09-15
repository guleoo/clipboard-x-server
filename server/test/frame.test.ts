import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { createServerApp } from "../src/entry";
import {
  ErrorCode,
  PageReqSchema,
  Result,
  ServiceError,
} from "../src/frame/core";
import {
  createApp,
  createPublicHono,
  HttpError,
  mountRoutes,
} from "../src/frame/hono";
import { Database, db } from "../src/db";
import { register, zz } from "../src/frame/zod";
import { validator } from "../src/frame/hono";

const ExpectedFailure = ErrorCode.of(100_001_001, "Expected failure");

class ExpectedServiceError extends ServiceError<{
  readonly resourceId: string;
}> {
  constructor(resourceId: string) {
    super(ExpectedFailure, { resourceId });
  }
}

describe("frame", () => {
  it("retains governed extension and pagination entry points", () => {
    const extended = register(zz, {
      identifier: () => zz.string().trim().min(1),
    });
    expect(extended.identifier().parse(" account-1 ")).toBe("account-1");
    expect(PageReqSchema.parse({ page: "2", pageSize: "20" })).toEqual({
      page: 2,
      pageSize: 20,
    });
    expect(PageReqSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
  });

  it("preserves public errors and hides unexpected failures", async () => {
    const failures = createPublicHono("/failures");
    failures.get("/expected", () => {
      throw new ExpectedServiceError("resource-1");
    });
    failures.get("/unexpected", () => {
      throw new Error("private detail");
    });
    failures.get("/http", () => {
      throw new HttpError(418, "Expected HTTP failure");
    });
    const app = createApp();
    mountRoutes(app, [failures]);

    const expected = await app.request("/api/failures/expected");
    expect(expected.status).toBe(400);
    expect(await expected.json()).toEqual({
      code: 400,
      msg: "Expected failure",
    });

    const unexpected = await app.request("/api/failures/unexpected");
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      code: 500,
      msg: "Internal server error",
    });

    const http = await app.request("/api/failures/http");
    expect(http.status).toBe(418);
    expect(await http.json()).toEqual({
      code: 418,
      msg: "Expected HTTP failure",
    });
  });

  it("propagates request IDs and returns the governed not-found response", async () => {
    const app = createApp();
    const response = await app.request("/missing", {
      headers: { "x-request-id": "test-request" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("test-request");
    expect(await response.json()).toEqual({ code: 404, msg: "Not found" });
  });

  it("mounts global, surface, local, and route prefixes in order", async () => {
    const route = createPublicHono("/probe", { surface: "admin" });
    route.get("/", (context) => context.json({ ok: true }));
    const app = createApp();
    mountRoutes(app, [route], { prefix: "/internal" });

    expect((await app.request("/api/admin/internal/probe")).status).toBe(200);
    expect((await app.request("/api/internal/admin/probe")).status).toBe(404);
  });

  it("validates request input once and preserves the result envelope", async () => {
    const route = createPublicHono("/validation");
    route.get(
      "/:id",
      validator("param", zz.object({ id: zz.string().min(2) })),
      (context) => context.json(Result.data(context.req.valid("param"))),
    );
    const app = createServerApp([route]);

    const invalid = await app.request("/api/validation/x");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ code: 400, msg: "Invalid request" });

    const valid = await app.request("/api/validation/ok");
    expect(await valid.json()).toEqual({
      code: 200,
      msg: "ok",
      result: { id: "ok" },
    });
  });

  it("rolls back a synchronous SQLite transaction", () => {
    db.run(
      sql.raw(
        "create table if not exists transaction_probe (id integer primary key)",
      ),
    );
    db.run(sql.raw("delete from transaction_probe"));

    expect(() =>
      db.transaction(() => {
        db.run(
          sql.raw("insert into transaction_probe(id) values (1)"),
        );
        throw new Error("rollback");
      }),
    ).toThrow("rollback");

    expect(db.all(sql.raw("select id from transaction_probe"))).toEqual(
      [],
    );
  });

  it("rejects asynchronous SQLite transaction callbacks at runtime", () => {
    expect(() => db.transaction(async () => undefined)).toThrow(
      "must not return a Promise",
    );
  });
});
