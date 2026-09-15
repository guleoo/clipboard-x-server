import { createMiddleware } from "hono/factory";
import type { Fields } from "../core/common";
import { AsyncStore } from "../core/context";
import { createUUID } from "../core/idgen";

export interface RequestContext {
  requestId: string;
  sid?: string;
  tenantId?: string;
  uid?: string;
  authType?: "SESSION" | "API_KEY" | "OAUTH";
  permissionKeys?: readonly string[];
}

export const RequestStore = AsyncStore.context<RequestContext & Fields>({
  key: "RequestContext",
});

export function currentUid(): string {
  return RequestStore.fetch("uid");
}

export function optionalCurrentUid(): string | undefined {
  return RequestStore.get("uid");
}

export function currentTenantId(): string {
  return RequestStore.fetch("tenantId");
}

export const requestContext = createMiddleware(async (context, next) => {
  if (RequestStore.getStore()) {
    await next();
    return;
  }
  const requestId =
    context.req.header("x-request-id")?.trim() || createUUID();
  context.header("x-request-id", requestId);
  await RequestStore.run(
    {
      requestId,
      sid: undefined,
      uid: undefined,
      tenantId: undefined,
      authType: undefined,
      permissionKeys: undefined,
    },
    next,
  );
});
