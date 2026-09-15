import type { Context } from "hono";
import type { AppHono } from "../frame/hono";
import { transferService } from "../service/transfer";
import { currentDeviceId } from "./auth";
import { integerQuery } from "./input";
import { operation } from "./openapi";

export function registerAdminTransferRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string) =>
    operation({ operationId, tags: ["Admin transfers"], summary, auth: true, scheme: "adminSession" });
  router.get("/transfers", doc("listAdminTransfers", "List transfers"), (context) => context.json({
    transfers: transferService.list(undefined, integerQuery(context.req.query("limit"), 100, 1, 500)),
  }));
  router.get("/transfers/:transferId", doc("getAdminTransfer", "Get transfer"), (context) =>
    context.json(transferService.get(context.req.param("transferId"))));
  router.delete("/transfers/:transferId", doc("cancelAdminTransfer", "Cancel transfer"), (context) =>
    context.json(transferService.cancel(context.req.param("transferId"))));
}

export function registerDeviceTransferRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string) =>
    operation({ operationId, tags: ["Device transfers"], summary, auth: true, scheme: "deviceKey" });
  const deviceId = (context: Context) =>
    currentDeviceId(context.req.header("x-clipboard-x-device-id"));
  router.get("/transfers", doc("listDeviceTransfers", "List current device transfers"), (context) =>
    context.json({ transfers: transferService.list(deviceId(context)) }));
  router.get("/transfers/:transferId", doc("getDeviceTransfer", "Get current device transfer"), (context) =>
    context.json(transferService.get(context.req.param("transferId"), deviceId(context))));
  router.delete("/transfers/:transferId", doc("cancelDeviceTransfer", "Cancel current device transfer"), (context) =>
    context.json(transferService.cancel(context.req.param("transferId"), deviceId(context))));
}
