import type { Env, Schema } from "hono";
import { FrameConfig } from "../config";
import { SystemError } from "../core";
import type { AppHono, AppRoute } from "./router";
import { routePath, routeSurface } from "./router";

export interface MountRoutesOptions {
  /** A local prefix appended after the global and surface prefixes. */
  readonly prefix?: string;
  /** Replace the configured global prefix with the local prefix. */
  readonly overridePrefix?: boolean;
}

function joinRoutePath(...parts: Array<string | undefined>): string {
  const paths = parts
    .filter(
      (part): part is string =>
        typeof part === "string" && part.length > 0 && part !== "/",
    )
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return paths.length > 0 ? `/${paths.join("/")}` : "/";
}

function surfacePrefix(route: AppRoute): string | undefined {
  const surface = route[routeSurface];
  if (!surface) return undefined;
  const prefix = FrameConfig.App.routeSurfaces[surface];
  if (prefix === undefined) {
    throw new SystemError(`Route surface is not configured: ${surface}`);
  }
  return prefix;
}

/** Mount every application router before the app handles its first request. */
export function mountRoutes<
  Environment extends Env = Env,
  Routes extends Schema = {},
  BasePath extends string = "/",
>(
  app: AppHono<Environment, Routes, BasePath>,
  routes: readonly AppRoute[],
  options: MountRoutesOptions = {},
): AppHono<Environment, Routes, BasePath> {
  for (const route of routes) {
    const prefix = options.overridePrefix
      ? options.prefix
      : joinRoutePath(FrameConfig.App.apiPrefix, surfacePrefix(route), options.prefix);
    app.route(joinRoutePath(prefix, route[routePath]), route);
  }
  return app;
}
