import { Hono } from "hono"
import type { Application } from "../application"
import { adminAuth, deviceAuth, sameOrigin } from "../http/middleware/auth"
import type { HttpEnvironment } from "../http/types"
import { registerAdminChannelRoutes, registerDeviceChannelRoutes } from "./channel/channel/channel.route"
import { registerAdminClipboardRoutes, registerDeviceClipboardRoutes } from "./clipboard/item/item.route"
import { registerAdminDeviceRoutes, registerDeviceProfileRoutes } from "./device/device/device.route"
import { registerProtectedAdministratorRoutes, registerPublicAdministratorRoutes } from "./identity/administrator/administrator.route"
import { registerAdminTransferRoutes, registerDeviceTransferRoutes } from "./transfer/transfer/transfer.route"
import { operation } from "../http/openapi"

export function createAdminApi(application: Application): Hono<HttpEnvironment> {
  const router = new Hono<HttpEnvironment>()
  registerPublicAdministratorRoutes(router, application)
  const protectedRouter = new Hono<HttpEnvironment>()
  protectedRouter.use("*", adminAuth(application))
  protectedRouter.use("*", sameOrigin(application))
  registerProtectedAdministratorRoutes(protectedRouter, application)
  protectedRouter.get("/overview", operation({ operationId: "getAdminOverview", tags: ["Admin operations"], summary: "Get administrator overview", auth: true, scheme: "adminSession" }), (context) => context.json(application.overview.get()))
  registerAdminDeviceRoutes(protectedRouter, application)
  registerAdminChannelRoutes(protectedRouter, application)
  registerAdminClipboardRoutes(protectedRouter, application)
  registerAdminTransferRoutes(protectedRouter, application)
  router.route("/", protectedRouter)
  return router
}

export function createDeviceApi(application: Application): Hono<HttpEnvironment> {
  const router = new Hono<HttpEnvironment>()
  router.use("*", deviceAuth(application))
  registerDeviceProfileRoutes(router, application)
  registerDeviceChannelRoutes(router, application)
  registerDeviceClipboardRoutes(router, application)
  registerDeviceTransferRoutes(router, application)
  return router
}
