import { createMiddleware } from "hono/factory";
import { createUUID, RequestStore } from "../core";

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
    { requestId },
    next,
  );
});
