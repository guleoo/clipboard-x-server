import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import type { Application } from "../application"
import { DomainError } from "../common/error"
import { DeviceIconSchema, SafeTextSchema, UuidSchema } from "../common/validation"
import { adminAuth, adminCookieName, sameOrigin } from "../http/middleware/auth"
import { integerQuery, json } from "../http/input"
import type { HttpEnvironment } from "../http/types"
import { overview } from "./overview"

const CredentialsSchema = z.object({
  username: SafeTextSchema(64).min(3),
  password: z.string().min(7).max(256),
})

const DeviceSchema = z.object({
  id: UuidSchema,
  tag: SafeTextSchema(256).min(1),
  iconKind: DeviceIconSchema,
})

const DeviceUpdateSchema = z.object({
  tag: SafeTextSchema(256).min(1).optional(),
  iconKind: DeviceIconSchema.optional(),
  disabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required")

const ChannelSchema = z.object({ name: SafeTextSchema(256).min(1) })

function sessionCookie(application: Application, c: Parameters<typeof setCookie>[0], token: string, expiresAt: number): void {
  setCookie(c, adminCookieName, token, {
    httpOnly: true,
    secure: application.config.cookieSecure,
    sameSite: "Strict",
    path: "/",
    expires: new Date(expiresAt),
  })
}

function binary(object: { readonly path: string; readonly size: number; readonly mimeType: string; readonly sha256: string }): Response {
  return new Response(Bun.file(object.path).stream(), {
    headers: {
      "Content-Type": object.mimeType,
      "Content-Length": String(object.size),
      "X-Content-Sha256": object.sha256,
      ETag: `"sha256-${object.sha256}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  })
}

export function createAdminApi(application: Application): Hono<HttpEnvironment> {
  const api = new Hono<HttpEnvironment>()

  api.post("/session", sameOrigin(application), async (c) => {
    const input = await json(c, CredentialsSchema)
    const session = await application.auth.login(input.username, input.password)
    sessionCookie(application, c, session.token, session.expiresAt)
    return c.json({ administrator: session.administrator, expiresAt: session.expiresAt })
  })
  api.get("/session", (c) => {
    const administrator = application.auth.authenticate(getCookie(c, adminCookieName))
    return c.json({ administrator })
  })

  const protectedApi = new Hono<HttpEnvironment>()
  protectedApi.use("*", adminAuth(application))
  protectedApi.use("*", sameOrigin(application))

  protectedApi.delete("/session", (c) => {
    application.auth.logout(c.get("adminToken"))
    deleteCookie(c, adminCookieName, { path: "/" })
    return c.body(null, 204)
  })
  protectedApi.patch("/administrator", async (c) => {
    const input = await json(c, CredentialsSchema)
    await application.auth.update(input.username, input.password)
    deleteCookie(c, adminCookieName, { path: "/" })
    return c.body(null, 204)
  })
  protectedApi.get("/overview", (c) => c.json(overview(application.database.raw)))

  protectedApi.get("/devices", (c) => c.json({ devices: application.devices.list() }))
  protectedApi.post("/devices", async (c) => c.json(application.devices.create(await json(c, DeviceSchema)), 201))
  protectedApi.patch("/devices/:deviceId", async (c) => c.json(application.devices.update(
    c.req.param("deviceId"),
    await json(c, DeviceUpdateSchema),
  )))
  protectedApi.delete("/devices/:deviceId", (c) => {
    application.devices.delete(c.req.param("deviceId"))
    return c.body(null, 204)
  })
  protectedApi.post("/devices/:deviceId/keys", async (c) => c.json(
    await application.devices.issueKey(c.req.param("deviceId")),
    201,
  ))
  protectedApi.delete("/devices/:deviceId/keys/:keyId", (c) => {
    application.devices.revokeKey(c.req.param("deviceId"), c.req.param("keyId"))
    return c.body(null, 204)
  })

  protectedApi.get("/channels", (c) => c.json({ channels: application.channels.list() }))
  protectedApi.post("/channels", async (c) => c.json(
    application.channels.create((await json(c, ChannelSchema)).name),
    201,
  ))
  protectedApi.patch("/channels/:channelId", async (c) => c.json(
    application.channels.update(c.req.param("channelId"), (await json(c, ChannelSchema)).name),
  ))
  protectedApi.delete("/channels/:channelId", (c) => {
    application.channels.delete(c.req.param("channelId"))
    return c.body(null, 204)
  })
  protectedApi.put("/channels/:channelId/members/:deviceId", (c) => {
    application.channels.addMember(c.req.param("channelId"), c.req.param("deviceId"))
    return c.body(null, 204)
  })
  protectedApi.delete("/channels/:channelId/members/:deviceId", (c) => {
    application.channels.removeMember(c.req.param("channelId"), c.req.param("deviceId"))
    return c.body(null, 204)
  })

  protectedApi.get("/items", (c) => c.json(application.clipboard.list({
    ...(c.req.query("channelId") ? { channelId: c.req.query("channelId") } : {}),
    ...(c.req.query("deviceId") ? { deviceId: c.req.query("deviceId") } : {}),
    ...(c.req.query("mimeType") ? { mimeType: c.req.query("mimeType") } : {}),
    ...(c.req.query("query") ? { query: c.req.query("query") } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
    limit: integerQuery(c.req.query("limit"), 50, 1, 200),
  })))
  protectedApi.get("/items/:itemId", (c) => c.json(application.clipboard.adminItem(c.req.param("itemId"))))
  protectedApi.delete("/items/:itemId", (c) => {
    application.clipboard.deleteItem(c.req.param("itemId"))
    return c.body(null, 204)
  })
  protectedApi.get("/items/:itemId/previews/:previewId", (c) => binary(
    application.clipboard.adminPreview(c.req.param("itemId"), c.req.param("previewId")),
  ))
  protectedApi.post("/items/:itemId/contents/:contentId/requests", (c) => {
    const item = application.clipboard.adminItem(c.req.param("itemId"))
    return c.json(application.clipboard.requestContent({
      requesterKind: "admin",
      requesterId: "admin",
      channelId: item.channelId,
      itemId: item.id,
      contentId: c.req.param("contentId"),
    }), 202)
  })
  protectedApi.get("/items/:itemId/contents/:contentId", (c) => binary(
    application.clipboard.adminContent(c.req.param("itemId"), c.req.param("contentId")),
  ))

  protectedApi.get("/transfers", (c) => c.json({
    transfers: application.transfers.list(undefined, integerQuery(c.req.query("limit"), 100, 1, 500)),
  }))
  protectedApi.get("/transfers/:transferId", (c) => c.json(application.transfers.get(c.req.param("transferId"))))
  protectedApi.delete("/transfers/:transferId", (c) => c.json(
    application.transfers.cancel(c.req.param("transferId")),
  ))

  api.route("/", protectedApi)
  return api
}
