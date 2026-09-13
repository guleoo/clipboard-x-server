import type { Hono } from "hono"
import type { Application } from "../../../application"
import { integerQuery } from "../../../http/input"
import type { HttpEnvironment } from "../../../http/types"
import { operation } from "../../../http/openapi"

export function registerAdminTransferRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string) => operation({ operationId, tags: ["Admin transfers"], summary, auth: true, scheme: "adminSession" })
  router.get("/transfers", doc("listAdminTransfers", "List transfers"), (context) => context.json({
    transfers: application.transfers.list(undefined, integerQuery(context.req.query("limit"), 100, 1, 500)),
  }))
  router.get("/transfers/:transferId", doc("getAdminTransfer", "Get transfer"), (context) =>
    context.json(application.transfers.get(context.req.param("transferId"))))
  router.delete("/transfers/:transferId", doc("cancelAdminTransfer", "Cancel transfer"), (context) =>
    context.json(application.transfers.cancel(context.req.param("transferId"))))
}

export function registerDeviceTransferRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string) => operation({ operationId, tags: ["Device transfers"], summary, auth: true, scheme: "deviceKey" })
  router.get("/transfers", doc("listDeviceTransfers", "List current device transfers"), (context) =>
    context.json({ transfers: application.transfers.list(context.get("device").deviceId) }))
  router.get("/transfers/:transferId", doc("getDeviceTransfer", "Get current device transfer"), (context) => context.json(application.transfers.get(
    context.req.param("transferId"),
    context.get("device").deviceId,
  )))
  router.delete("/transfers/:transferId", doc("cancelDeviceTransfer", "Cancel current device transfer"), (context) => context.json(application.transfers.cancel(
    context.req.param("transferId"),
    context.get("device").deviceId,
  )))
}
