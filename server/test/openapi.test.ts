import { describe, expect, it } from "bun:test";
import { Result, successResultSchema } from "../src/frame/core";
import {
  createApp,
  createPublicHono,
  generateSpecs,
  mountRoutes,
  openapi,
  validator,
} from "../src/frame/hono";
import { zz } from "../src/frame/zod";
import { framePath } from "./frame-path";

describe("OpenAPI capability", () => {
  it("uses one schema for runtime validation and request documentation", async () => {
    const input = zz.object({ id: zz.string().min(2) });
    const output = zz.object({ id: zz.string() });
    const routes = createPublicHono("/items");
    routes.get(
      "/:id",
      openapi.data({
        tags: ["Items"],
        summary: "Get item",
        operationId: "getItem",
        auth: false,
        schema: output,
      }),
      validator("param", input),
      (context) => context.json(Result.data(context.req.valid("param"))),
    );
    const app = createApp();
    mountRoutes(app, [routes]);

    expect((await app.request(framePath("/items/x"))).status).toBe(400);
    const specs = await generateSpecs(app);
    const operation = specs.paths[framePath("/items/{id}")]?.get;
    expect(operation?.operationId).toBe("getItem");
    const extensions = operation as unknown as
      | Record<string, unknown>
      | undefined;
    expect(extensions?.["x-auth-required"]).toBe(false);
    expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "400", "500"]);
    const successResponse = operation?.responses?.[
      "200"
    ] as
      | {
          readonly content?: {
            readonly "application/json"?: { readonly schema?: unknown };
          };
        }
      | undefined;
    const responseSchema = successResponse?.content?.["application/json"]
      ?.schema as
      | { readonly required?: readonly string[] }
      | undefined;
    expect(responseSchema?.required).toContain("result");
    expect(
      successResultSchema(output).safeParse({ code: 200, msg: "ok" }).success,
    ).toBe(false);
  });
});
