import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { DomainError } from "../common/error";
import { config } from "../config";
import { RequestStore } from "../frame/hono";

export const adminCookieName = "clipboard_x_admin";

export const adminCredential = (context: Parameters<typeof getCookie>[0]) =>
  getCookie(context, adminCookieName);

export const sameOrigin = createMiddleware(async (context, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
    await next();
    return;
  }
  const fetchSite = context.req.header("sec-fetch-site")?.toLowerCase();
  if (fetchSite) {
    if (fetchSite !== "same-origin") {
      throw new DomainError(
        "not_authorized",
        "Cross-origin administrator request was rejected",
        403,
      );
    }
    await next();
    return;
  }

  const origin = context.req.header("origin");
  if (!origin) {
    throw new DomainError("not_authorized", "Origin header is required", 403);
  }
  const expected = config.publicOrigin ?? new URL(context.req.url).origin;
  let actualOrigin: string;
  try {
    actualOrigin = new URL(origin).origin;
  } catch {
    throw new DomainError("not_authorized", "Origin header is invalid", 403);
  }
  if (actualOrigin !== new URL(expected).origin) {
    throw new DomainError(
      "not_authorized",
      "Cross-origin administrator request was rejected",
      403,
    );
  }
  await next();
});

export function currentDeviceId(claimedDeviceId: string | undefined): string {
  const deviceId = RequestStore.fetch("uid");
  if (!claimedDeviceId || deviceId !== claimedDeviceId) {
    throw new DomainError(
      "device_mismatch",
      "API key does not belong to the claimed DeviceId",
      403,
    );
  }
  return deviceId;
}

export function currentSessionId(): string {
  return RequestStore.fetch("sid");
}
