import type { Hono } from "hono"
import type { Application } from "../../../application"
import { openApiValidator as validator } from "../../../frame/hono/openapi-validator"
import type { HttpEnvironment } from "../../../http/types"
import { operation } from "../../../http/openapi"
import { DeviceCreateSchema, DeviceProfileSchema, DeviceUpdateSchema } from "./device.dto"

export function registerAdminDeviceRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 204 = 200) => operation({ operationId, tags: ["Admin devices"], summary, auth: true, scheme: "adminSession", status })
  router.get("/devices", doc("listDevices", "List devices"), (context) => context.json({ devices: application.devices.list() }))
  router.post("/devices", doc("createDevice", "Create device", 201), validator("json", DeviceCreateSchema), (context) =>
    context.json(application.devices.create(context.req.valid("json")), 201))
  router.patch("/devices/:deviceId", doc("updateDevice", "Update device"), validator("json", DeviceUpdateSchema), (context) =>
    context.json(application.devices.update(context.req.param("deviceId"), context.req.valid("json"))))
  router.delete("/devices/:deviceId", doc("deleteDevice", "Delete device", 204), (context) => {
    application.devices.delete(context.req.param("deviceId"))
    return context.body(null, 204)
  })
  router.post("/devices/:deviceId/keys", doc("createDeviceKey", "Create device key", 201), async (context) =>
    context.json(await application.devices.issueKey(context.req.param("deviceId")), 201))
  router.delete("/devices/:deviceId/keys/:keyId", doc("deleteDeviceKey", "Delete device key", 204), (context) => {
    application.devices.revokeKey(context.req.param("deviceId"), context.req.param("keyId"))
    return context.body(null, 204)
  })
}

export function registerDeviceProfileRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string) => operation({ operationId, tags: ["Device"], summary, auth: true, scheme: "deviceKey" })
  router.get("/device", doc("getDevice", "Get current device"), (context) => context.json(application.devices.get(context.get("device").deviceId)))
  router.put("/device/profile", doc("updateDeviceProfile", "Update current device profile"), validator("json", DeviceProfileSchema), (context) =>
    context.json(application.devices.updateProfile(context.get("device").deviceId, context.req.valid("json"))))
}
