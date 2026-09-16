import { FrameConfig } from "../src/frame/config"
import type { RouteSurface } from "../src/frame/hono"

function join(...parts: readonly (string | undefined)[]): string {
  const path = parts
    .filter((part): part is string => Boolean(part && part !== "/"))
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")
  return path ? `/${path}` : "/"
}

export function framePath(
  path: string,
  options: { readonly surface?: RouteSurface; readonly prefix?: string } = {},
): string {
  return join(
    FrameConfig.App.apiPrefix,
    options.surface ? FrameConfig.App.routeSurfaces[options.surface] : undefined,
    options.prefix,
    path,
  )
}
