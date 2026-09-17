import { deleteCookie, setCookie } from "hono/cookie";
import type { AppHono } from "../frame/hono";
import { validator } from "./validator";
import { CleanupOptions, CleanupOverrideError, config } from "../config";
import { DomainError } from "../common/error";
import { CredentialsSchema } from "../dto/administrator";
import { administratorService } from "../service/administrator";
import { adminCookieName, currentSessionId } from "./auth";
import { operation } from "./openapi";
import { cleanupService } from "../service/cleanup";

function setSessionCookie(
  context: Parameters<typeof setCookie>[0],
  token: string,
  expiresAt: number,
): void {
  setCookie(context, adminCookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Strict",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function registerPublicAdministratorRoutes(router: AppHono): void {
  router.post(
    "/session",
    operation({
      operationId: "createAdminSession",
      tags: ["Admin authentication"],
      summary: "Create administrator session",
      auth: false,
    }),
    validator("json", CredentialsSchema),
    async (context) => {
      const input = context.req.valid("json");
      const session = await administratorService.login(input.username, input.password);
      setSessionCookie(context, session.token, session.expiresAt);
      return context.json({
        administrator: session.administrator,
        expiresAt: session.expiresAt,
      });
    },
  );
}

export function registerProtectedAdministratorRoutes(router: AppHono): void {
  router.get(
    "/configuration/cleanup",
    operation({
      operationId: "getAdminCleanupConfiguration",
      tags: ["Admin configuration"],
      summary: "Get server cleanup configuration",
      auth: true,
      scheme: "adminSession",
    }),
    (context) => context.json(config.cleanup),
  );
  router.patch(
    "/configuration/cleanup",
    operation({
      operationId: "updateAdminCleanupConfiguration",
      tags: ["Admin configuration"],
      summary: "Update server cleanup configuration",
      auth: true,
      scheme: "adminSession",
    }),
    validator("json", CleanupOptions),
    (context) => {
      const previous = config.cleanup;
      let cleanup: typeof config.cleanup;
      try {
        cleanup = config.updateCleanup(context.req.valid("json"));
      } catch (cause) {
        if (cause instanceof CleanupOverrideError) {
          throw new DomainError("configuration_conflict", cause.message, 409);
        }
        throw cause;
      }
      cleanupService.configure({ runNow: cleanupService.tightens(previous, cleanup) });
      return context.json(cleanup);
    },
  );
  router.get(
    "/session",
    operation({
      operationId: "getAdminSession",
      tags: ["Admin authentication"],
      summary: "Get administrator session",
      auth: true,
      scheme: "adminSession",
    }),
    (context) =>
      context.json({ administrator: administratorService.current() }),
  );
  router.delete(
    "/session",
    operation({
      operationId: "deleteAdminSession",
      tags: ["Admin authentication"],
      summary: "Delete administrator session",
      auth: true,
      scheme: "adminSession",
      status: 204,
    }),
    (context) => {
      administratorService.logout(currentSessionId());
      deleteCookie(context, adminCookieName, { path: "/" });
      return context.body(null, 204);
    },
  );
  router.patch(
    "/administrator",
    operation({
      operationId: "updateAdministrator",
      tags: ["Admin authentication"],
      summary: "Update administrator credentials",
      auth: true,
      scheme: "adminSession",
      status: 204,
    }),
    validator("json", CredentialsSchema),
    async (context) => {
      const input = context.req.valid("json");
      await administratorService.update(input.username, input.password);
      deleteCookie(context, adminCookieName, { path: "/" });
      return context.body(null, 204);
    },
  );
}
