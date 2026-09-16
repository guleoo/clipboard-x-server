import type { Context } from "hono"
import { DomainError } from "../common/error"
import { config } from "../config"
import { virtualDevice } from "../common/virtual-device"
import { AdminItemManifestSchema, ItemManifestSchema, WorkRejectionSchema } from "../dto/clipboard"
import type { AppHono } from "../frame/hono"
import { objectStore } from "../repo/object"
import { clipboardService } from "../service/clipboard"
import { currentDeviceId } from "./auth"
import { integerQuery } from "./input"
import { operation } from "./openapi"
import { validator } from "./validator"

interface BinaryObject { readonly path: string; readonly size: number; readonly mimeType: string; readonly sha256: string }

function binary(object: BinaryObject): Response {
  return new Response(Bun.file(object.path).stream(), { headers: {
    "Content-Type": object.mimeType,
    "Content-Length": String(object.size),
    "X-Content-Sha256": object.sha256,
    ETag: `"sha256-${object.sha256}"`,
    "Cache-Control": "private, max-age=31536000, immutable",
  } })
}

function requestDeviceId(context: Context): string {
  return currentDeviceId(context.req.header("x-clipboard-x-device-id"))
}

async function upload(context: Context, kind: "preview" | "content", deviceId: string): Promise<Response> {
  const expectation = clipboardService.uploadExpectation(
    context.req.param("uploadId") ?? "", kind,
    context.req.param(kind === "preview" ? "previewId" : "contentId") ?? "", deviceId,
  )
  const contentLength = Number(context.req.header("content-length"))
  if (!Number.isSafeInteger(contentLength) || contentLength !== expectation.expected_size) {
    throw new DomainError("invalid_request", "Content-Length must match the manifest", 400)
  }
  if (context.req.header("content-type")?.toLowerCase() !== expectation.mime_type.toLowerCase()) {
    throw new DomainError("invalid_request", "Content-Type must match the manifest", 400)
  }
  let lastPersisted = 0
  const stored = await objectStore.write(context.req.raw.body, {
    size: expectation.expected_size,
    sha256: expectation.expected_sha256,
    maximumBytes: kind === "preview" ? config.maxPreviewBytes : config.maxObjectBytes,
    signal: context.req.raw.signal,
    onProgress(completedBytes) {
      const now = Date.now()
      if (now - lastPersisted >= 150) {
        clipboardService.progressUpload(expectation, completedBytes)
        lastPersisted = now
      }
    },
  })
  clipboardService.recordUploadedObject(expectation, stored)
  return context.json({ size: stored.size, sha256: stored.sha256 })
}

export function registerAdminClipboardRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 202 | 204 = 200, binaryContent = false) => operation({
    operationId, tags: ["Admin clipboard"], summary, auth: true, scheme: "adminSession", status, binary: binaryContent,
  })
  router.get("/items", doc("listAdminItems", "List clipboard items"), (context) => context.json(clipboardService.list({
    ...(context.req.query("channelId") ? { channelId: context.req.query("channelId") } : {}),
    ...(context.req.query("deviceId") ? { deviceId: context.req.query("deviceId") } : {}),
    ...(context.req.query("mimeType") ? { mimeType: context.req.query("mimeType") } : {}),
    ...(context.req.query("query") ? { query: context.req.query("query") } : {}),
    ...(context.req.query("cursor") ? { cursor: context.req.query("cursor") } : {}),
    limit: integerQuery(context.req.query("limit"), 50, 1, 200),
  })))
  router.post(
    "/channels/:channelId/items",
    doc("createAdminClipboardItem", "Publish clipboard item from the virtual device", 201),
    validator("json", AdminItemManifestSchema),
    (context) => context.json(clipboardService.publishFromVirtualDevice(
      context.req.param("channelId"),
      context.req.valid("json"),
    ), 201),
  )
  router.get("/items/:itemId", doc("getAdminItem", "Get clipboard item"), (context) => context.json(clipboardService.adminItem(context.req.param("itemId"))))
  router.delete("/items/:itemId", doc("deleteAdminItem", "Delete clipboard item", 204), (context) => { clipboardService.deleteItem(context.req.param("itemId")); return context.body(null, 204) })
  router.get("/items/:itemId/previews/:previewId", doc("getAdminPreview", "Download clipboard preview", 200, true), (context) => binary(
    clipboardService.adminPreview(context.req.param("itemId"), context.req.param("previewId")),
  ))
  router.post("/items/:itemId/contents/:contentId/requests", doc("requestAdminContent", "Request clipboard content", 202), (context) => {
    const item = clipboardService.adminItem(context.req.param("itemId"))
    return context.json(clipboardService.requestContent({
      requesterKind: "admin", requesterId: "admin", channelId: item.channelId,
      itemId: item.id, contentId: context.req.param("contentId"),
    }), 202)
  })
  router.get("/items/:itemId/contents/:contentId", doc("getAdminContent", "Download clipboard content", 200, true), (context) => binary(
    clipboardService.adminContent(context.req.param("itemId"), context.req.param("contentId")),
  ))
  router.put("/uploads/:uploadId/previews/:previewId", doc("uploadAdminPreview", "Upload virtual device clipboard preview"), (context) =>
    upload(context, "preview", virtualDevice.id))
  router.put("/uploads/:uploadId/contents/:contentId", doc("uploadAdminContent", "Upload virtual device clipboard content"), (context) =>
    upload(context, "content", virtualDevice.id))
  router.post("/uploads/:uploadId/complete", doc("completeAdminUpload", "Complete virtual device clipboard upload"), (context) =>
    context.json(clipboardService.completeUpload(context.req.param("uploadId"), virtualDevice.id)))
}

export function registerDeviceClipboardRoutes(router: AppHono): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 202 | 204 = 200, binaryContent = false, tag = "Clipboard") => operation({
    operationId, tags: [tag], summary, auth: true, scheme: "deviceKey", status, binary: binaryContent,
  })
  router.get("/status", doc("getServerStatus", "Get server status", 200, false, "Device"), (context) => context.json(clipboardService.status()))
  router.post("/channels/:channelId/items", doc("createClipboardItem", "Publish clipboard item", 201), validator("json", ItemManifestSchema), (context) => context.json(
    clipboardService.createPublication(requestDeviceId(context), context.req.param("channelId"), context.req.valid("json")), 201,
  ))
  router.get("/channels/:channelId/changes", doc("listClipboardChanges", "List clipboard changes"), (context) => context.json(clipboardService.changes(
    requestDeviceId(context), context.req.param("channelId"), context.req.query("cursor"),
    integerQuery(context.req.query("limit"), 200, 1, 1_000),
  )))
  router.get("/channels/:channelId/items", doc("listDeviceItems", "List clipboard items"), (context) => context.json(clipboardService.list({
    channelId: context.req.param("channelId"),
    ...(context.req.query("query") ? { query: context.req.query("query") } : {}),
    ...(context.req.query("cursor") ? { cursor: context.req.query("cursor") } : {}),
    limit: integerQuery(context.req.query("limit"), 100, 1, 200),
    memberDeviceId: requestDeviceId(context),
  })))
  router.get("/channels/:channelId/items/:itemId", doc("getDeviceItem", "Get clipboard item"), (context) => context.json(clipboardService.item(
    requestDeviceId(context), context.req.param("channelId"), context.req.param("itemId"),
  )))
  router.delete("/channels/:channelId/items/:itemId", doc("deleteDeviceItem", "Delete clipboard item", 204), (context) => {
    clipboardService.deleteItem(context.req.param("itemId"), context.req.param("channelId"), requestDeviceId(context))
    return context.body(null, 204)
  })
  router.get("/channels/:channelId/items/:itemId/previews/:previewId", doc("getDevicePreview", "Download clipboard preview", 200, true), (context) => binary(clipboardService.preview(
    requestDeviceId(context), context.req.param("channelId"),
    context.req.param("itemId"), context.req.param("previewId"),
  )))
  router.post("/channels/:channelId/items/:itemId/contents/:contentId/requests", doc("requestDeviceContent", "Request clipboard content", 202), (context) => context.json(
    clipboardService.requestContent({
      requesterKind: "device", requesterId: requestDeviceId(context),
      memberDeviceId: requestDeviceId(context), channelId: context.req.param("channelId"),
      itemId: context.req.param("itemId"), contentId: context.req.param("contentId"),
    }), 202,
  ))
  router.get("/channels/:channelId/items/:itemId/contents/:contentId", doc("getDeviceContent", "Download clipboard content", 200, true), (context) => binary(clipboardService.content(
    requestDeviceId(context), context.req.param("channelId"),
    context.req.param("itemId"), context.req.param("contentId"),
  )))
  router.put("/uploads/:uploadId/previews/:previewId", doc("uploadPreview", "Upload clipboard preview"), (context) => upload(
    context, "preview", requestDeviceId(context),
  ))
  router.put("/uploads/:uploadId/contents/:contentId", doc("uploadContent", "Upload clipboard content"), (context) => upload(
    context, "content", requestDeviceId(context),
  ))
  router.post("/uploads/:uploadId/complete", doc("completeUpload", "Complete upload"), (context) => context.json(
    clipboardService.completeUpload(context.req.param("uploadId"), requestDeviceId(context)),
  ))
  router.get("/work", doc("listDeviceWork", "List pending device work", 200, false, "Work"), (context) => context.json(clipboardService.work(
    requestDeviceId(context), context.req.query("cursor"), integerQuery(context.req.query("limit"), 100, 1, 1_000),
  )))
  router.post("/work/:workId/accept", doc("acceptDeviceWork", "Accept device work", 200, false, "Work"), (context) => context.json(
    clipboardService.acceptWork(requestDeviceId(context), context.req.param("workId")),
  ))
  router.post("/work/:workId/reject", doc("rejectDeviceWork", "Reject device work", 204, false, "Work"), validator("json", WorkRejectionSchema), (context) => {
    const input = context.req.valid("json")
    clipboardService.rejectWork(requestDeviceId(context), context.req.param("workId"), input.code, input.message)
    return context.body(null, 204)
  })
}
