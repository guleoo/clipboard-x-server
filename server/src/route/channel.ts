import type { AppHono } from "../frame/hono";
import { validator } from "./validator";
import { ChannelInputSchema } from "../dto/channel";
import { channelService } from "../service/channel";
import { currentDeviceId } from "./auth";
import { operation } from "./openapi";

export function registerAdminChannelRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 204 = 200) =>
    operation({ operationId, tags: ["Admin channels"], summary, auth: true, scheme: "adminSession", status });
  router.get("/channels", doc("listChannels", "List channels"), (context) =>
    context.json({ channels: channelService.list() }));
  router.post("/channels", doc("createChannel", "Create channel", 201), validator("json", ChannelInputSchema), (context) =>
    context.json(channelService.create(context.req.valid("json").name), 201));
  router.patch("/channels/:channelId", doc("updateChannel", "Update channel"), validator("json", ChannelInputSchema), (context) =>
    context.json(channelService.update(context.req.param("channelId"), context.req.valid("json").name)));
  router.delete("/channels/:channelId", doc("deleteChannel", "Delete channel", 204), (context) => {
    channelService.delete(context.req.param("channelId"));
    return context.body(null, 204);
  });
  router.put("/channels/:channelId/members/:deviceId", doc("addChannelMember", "Add channel member", 204), (context) => {
    channelService.addMember(context.req.param("channelId"), context.req.param("deviceId"));
    return context.body(null, 204);
  });
  router.delete("/channels/:channelId/members/:deviceId", doc("removeChannelMember", "Remove channel member", 204), (context) => {
    channelService.removeMember(context.req.param("channelId"), context.req.param("deviceId"));
    return context.body(null, 204);
  });
}

export function registerDeviceChannelRoutes(router: AppHono): void {
  router.get("/channels", operation({
    operationId: "listDeviceChannels",
    tags: ["Device"],
    summary: "List channels for current device",
    auth: true,
    scheme: "deviceKey",
  }), (context) => context.json({
    channels: channelService.listForDevice(
      currentDeviceId(context.req.header("x-clipboard-x-device-id")),
    ),
  }));
}
