import type { Env, Schema } from "hono";
import { Result } from "../core";
import { createBaseHono, type CreateHonoOptions } from "./router";
import { errorHandler } from "./error-handler";
import { requestContext } from "./request-context";
import { requestLogger } from "./request-logger";

export function createApp<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
>(options?: CreateHonoOptions<Environment>) {
  const app = createBaseHono<Environment, Routes, BasePath>(options);
  app.use("*", requestContext);
  app.use("*", requestLogger());
  app.notFound((context) =>
    context.json(Result.fail(404, "Not found"), 404),
  );
  app.onError(errorHandler);
  return app;
}
