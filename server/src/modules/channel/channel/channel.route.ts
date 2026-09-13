import type { Hono } from "hono"
import type { Application } from "../../../application"
import { openApiValidator as validator } from "../../../frame/hono/openapi-validator"
import type { HttpEnvironment } from "../../../http/types"
import { operation } from "../../../http/openapi"
import { ChannelInputSchema } from "./channel.dto"

export function registerAdminChannelRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 204 = 200) => operation({ operationId, tags: ["Admin channels"], summary, auth: true, scheme: "adminSession", status })
  router.get("/channels", doc("listChannels", "List channels"), (context) => context.json({ channels: application.channels.list() }))
  router.post("/channels", doc("createChannel", "Create channel", 201), validator("json", ChannelInputSchema), (context) =>
    context.json(application.channels.create(context.req.valid("json").name), 201))
  router.patch("/channels/:channelId", doc("updateChannel", "Update channel"), validator("json", ChannelInputSchema), (context) =>
    context.json(application.channels.update(context.req.param("channelId"), context.req.valid("json").name)))
  router.delete("/channels/:channelId", doc("deleteChannel", "Delete channel", 204), (context) => {
    application.channels.delete(context.req.param("channelId"))
    return context.body(null, 204)
  })
  router.put("/channels/:channelId/members/:deviceId", doc("addChannelMember", "Add channel member", 204), (context) => {
    application.channels.addMember(context.req.param("channelId"), context.req.param("deviceId"))
    return context.body(null, 204)
  })
  router.delete("/channels/:channelId/members/:deviceId", doc("removeChannelMember", "Remove channel member", 204), (context) => {
    application.channels.removeMember(context.req.param("channelId"), context.req.param("deviceId"))
    return context.body(null, 204)
  })
}

export function registerDeviceChannelRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  router.get("/channels", operation({ operationId: "listDeviceChannels", tags: ["Device"], summary: "List channels for current device", auth: true, scheme: "deviceKey" }), (context) =>
    context.json({ channels: application.channels.listForDevice(context.get("device").deviceId) }))
}
