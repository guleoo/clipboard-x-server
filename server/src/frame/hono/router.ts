import { Hono, type Env, type Schema } from "hono";
import type { HonoOptions } from "hono/hono-base";
import type { RequestContext } from "./request-context";

type MergeEnv<Left extends Env, Right extends Env> = {
  Bindings: Left["Bindings"] & Right["Bindings"];
  Variables: Left["Variables"] & Right["Variables"];
};

export interface RequestContextEnv {
  Variables: RequestContext;
}

export type AppEnv<Environment extends Env = Env> = MergeEnv<
  Environment,
  RequestContextEnv
>;

export type AppHono<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
> = Hono<AppEnv<Environment>, Routes, BasePath>;

export type RouteSurface = "admin" | "app" | (string & {});

export interface CreateHonoOptions<Environment extends Env>
  extends HonoOptions<AppEnv<Environment>> {
  /** A configured API exposure surface whose prefix is resolved on mount. */
  readonly surface?: RouteSurface;
}

export const routePath = Symbol("hono.routePath");
export const routeSurface = Symbol("hono.routeSurface");

export type AppRoute<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
  Path extends string = string,
> = AppHono<Environment, Routes, BasePath> & {
  readonly [routePath]: Path;
  readonly [routeSurface]?: RouteSurface;
};

export function createBaseHono<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
>(
  options?: HonoOptions<AppEnv<Environment>>,
): AppHono<Environment, Routes, BasePath> {
  return new Hono<AppEnv<Environment>, Routes, BasePath>(options);
}

function baseOptions<Environment extends Env>(
  options?: CreateHonoOptions<Environment>,
): HonoOptions<AppEnv<Environment>> | undefined {
  if (!options) return undefined;
  const { surface: _surface, ...honoOptions } = options;
  return honoOptions;
}

function markRoute(
  router: AppHono<any, any, any>,
  path: string,
  surface?: RouteSurface,
): void {
  Object.defineProperty(router, routePath, {
    value: path,
    enumerable: false,
  });
  if (surface) {
    Object.defineProperty(router, routeSurface, {
      value: surface,
      enumerable: false,
    });
  }
}

/** Create a router that does not install authentication middleware. */
export function createPublicHono<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
  Path extends string = string,
>(
  path: Path,
  options?: CreateHonoOptions<Environment>,
): AppRoute<Environment, Routes, BasePath, Path> {
  const router = createBaseHono<Environment, Routes, BasePath>(
    baseOptions(options),
  );
  markRoute(router, path, options?.surface);
  return router as AppRoute<Environment, Routes, BasePath, Path>;
}
