import type { Env, Schema } from "hono";
import { auth, type CredentialReader } from "./auth";
import {
  createPublicHono,
  type AppRoute,
  type CreateHonoOptions,
} from "../hono/router";

export interface CreateSecureHonoOptions<Environment extends Env>
  extends CreateHonoOptions<Environment> {
  readonly credential?: CredentialReader;
}

export function createHono<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
  Path extends string = string,
>(
  path: Path,
  options?: CreateSecureHonoOptions<Environment>,
): AppRoute<Environment, Routes, BasePath, Path> {
  const { credential, ...routerOptions } = options ?? {};
  const router = createPublicHono<Environment, Routes, BasePath, Path>(
    path,
    routerOptions,
  );
  router.use("*", auth(credential));
  return router;
}
