import { createMiddleware } from "hono/factory";
import { Provider } from "../core";
import { RequestStore } from "../hono/request-context";
import {
  AuthError,
  ForbiddenError,
  PermissionDefinitionError,
} from "./error";
import { SecurityFrameService } from "./service";
import type { PermissionMode } from "./type";

function permissionMiddleware(mode: PermissionMode, permissions: readonly string[]) {
  if (permissions.length === 0 || permissions.some((value) => !value.trim())) {
    throw new PermissionDefinitionError("Permission names must be non-empty");
  }
  const demand = Object.freeze({ mode, permissions: Object.freeze([...permissions]) });
  return createMiddleware(async (_context, next) => {
    const uid = RequestStore.get("uid");
    if (!uid) throw new AuthError();
    const allowed = await Provider.inject(SecurityFrameService).hasPermission({
      uid,
      tenantId: RequestStore.get("tenantId"),
      demand,
    });
    if (!allowed) throw new ForbiddenError();
    await next();
  });
}

export const permission = Object.freeze({
  all: (...permissions: string[]) => permissionMiddleware("all", permissions),
  any: (...permissions: string[]) => permissionMiddleware("any", permissions),
});
