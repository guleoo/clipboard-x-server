import type { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { Application } from "../../../application"
import { openApiValidator as validator } from "../../../frame/hono/openapi-validator"
import { adminCookieName, sameOrigin } from "../../../http/middleware/auth"
import type { HttpEnvironment } from "../../../http/types"
import { operation } from "../../../http/openapi"
import { CredentialsSchema } from "./administrator.dto"

function setSessionCookie(
  application: Application,
  context: Parameters<typeof setCookie>[0],
  token: string,
  expiresAt: number,
): void {
  setCookie(context, adminCookieName, token, {
    httpOnly: true,
    secure: application.config.cookieSecure,
    sameSite: "Strict",
    path: "/",
    expires: new Date(expiresAt),
  })
}

export function registerPublicAdministratorRoutes(
  router: Hono<HttpEnvironment>,
  application: Application,
): void {
  router.post("/session", operation({ operationId: "createAdminSession", tags: ["Admin authentication"], summary: "Create administrator session", auth: false }), sameOrigin(application), validator("json", CredentialsSchema), async (context) => {
    const input = context.req.valid("json")
    const session = await application.auth.login(input.username, input.password)
    setSessionCookie(application, context, session.token, session.expiresAt)
    return context.json({ administrator: session.administrator, expiresAt: session.expiresAt })
  })
  router.get("/session", operation({ operationId: "getAdminSession", tags: ["Admin authentication"], summary: "Get administrator session", auth: true, scheme: "adminSession" }), (context) => {
    const administrator = application.auth.authenticate(getCookie(context, adminCookieName))
    return context.json({ administrator })
  })
}

export function registerProtectedAdministratorRoutes(
  router: Hono<HttpEnvironment>,
  application: Application,
): void {
  router.delete("/session", operation({ operationId: "deleteAdminSession", tags: ["Admin authentication"], summary: "Delete administrator session", auth: true, scheme: "adminSession", status: 204 }), (context) => {
    application.auth.logout(context.get("adminToken"))
    deleteCookie(context, adminCookieName, { path: "/" })
    return context.body(null, 204)
  })
  router.patch("/administrator", operation({ operationId: "updateAdministrator", tags: ["Admin authentication"], summary: "Update administrator credentials", auth: true, scheme: "adminSession", status: 204 }), validator("json", CredentialsSchema), async (context) => {
    const input = context.req.valid("json")
    await application.auth.update(input.username, input.password)
    deleteCookie(context, adminCookieName, { path: "/" })
    return context.body(null, 204)
  })
}
