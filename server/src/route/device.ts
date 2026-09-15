import type { AppHono } from "../frame/hono";
import { validator } from "./validator";
import {
  DeviceCreateSchema,
  DeviceProfileSchema,
  DeviceUpdateSchema,
} from "../dto/device";
import { deviceService } from "../service/device";
import { currentDeviceId } from "./auth";
import { operation } from "./openapi";

export function registerAdminDeviceRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 204 = 200) =>
    operation({ operationId, tags: ["Admin devices"], summary, auth: true, scheme: "adminSession", status });
  router.get("/devices", doc("listDevices", "List devices"), (context) =>
    context.json({ devices: deviceService.list() }));
  router.post("/devices", doc("createDevice", "Create device", 201), validator("json", DeviceCreateSchema), (context) =>
    context.json(deviceService.create(context.req.valid("json")), 201));
  router.patch("/devices/:deviceId", doc("updateDevice", "Update device"), validator("json", DeviceUpdateSchema), (context) =>
    context.json(deviceService.update(context.req.param("deviceId"), context.req.valid("json"))));
  router.delete("/devices/:deviceId", doc("deleteDevice", "Delete device", 204), (context) => {
    deviceService.delete(context.req.param("deviceId"));
    return context.body(null, 204);
  });
  router.post("/devices/:deviceId/keys", doc("createDeviceKey", "Create device key", 201), async (context) =>
    context.json(await deviceService.issueKey(context.req.param("deviceId")), 201));
  router.delete("/devices/:deviceId/keys/:keyId", doc("deleteDeviceKey", "Delete device key", 204), (context) => {
    deviceService.revokeKey(context.req.param("deviceId"), context.req.param("keyId"));
    return context.body(null, 204);
  });
}

export function registerDeviceProfileRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string) =>
    operation({ operationId, tags: ["Device"], summary, auth: true, scheme: "deviceKey" });
  router.get("/device", doc("getDevice", "Get current device"), (context) =>
    context.json(deviceService.get(currentDeviceId(context.req.header("x-clipboard-x-device-id")))));
  router.put("/device/profile", doc("updateDeviceProfile", "Update current device profile"), validator("json", DeviceProfileSchema), (context) =>
    context.json(deviceService.updateProfile(
      currentDeviceId(context.req.header("x-clipboard-x-device-id")),
      context.req.valid("json"),
    )));
}
