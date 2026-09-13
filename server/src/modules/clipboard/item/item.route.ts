import type { Context, Hono } from "hono"
import type { Application } from "../../../application"
import { DomainError } from "../../../common/error"
import { openApiValidator as validator } from "../../../frame/hono/openapi-validator"
import { integerQuery } from "../../../http/input"
import type { HttpEnvironment } from "../../../http/types"
import { operation } from "../../../http/openapi"
import { ItemManifestSchema, WorkRejectionSchema } from "./item.dto"

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

async function upload(application: Application, context: Context<HttpEnvironment>, kind: "preview" | "content"): Promise<Response> {
  const identity = context.get("device")
  const expectation = application.clipboard.uploadExpectation(
    context.req.param("uploadId") ?? "", kind,
    context.req.param(kind === "preview" ? "previewId" : "contentId") ?? "", identity.deviceId,
  )
  const contentLength = Number(context.req.header("content-length"))
  if (!Number.isSafeInteger(contentLength) || contentLength !== expectation.expected_size) {
    throw new DomainError("invalid_request", "Content-Length must match the manifest", 400)
  }
  if (context.req.header("content-type")?.toLowerCase() !== expectation.mime_type.toLowerCase()) {
    throw new DomainError("invalid_request", "Content-Type must match the manifest", 400)
  }
  let lastPersisted = 0
  const stored = await application.objects.write(context.req.raw.body, {
    size: expectation.expected_size,
    sha256: expectation.expected_sha256,
    maximumBytes: kind === "preview" ? application.config.maxPreviewBytes : application.config.maxObjectBytes,
    signal: context.req.raw.signal,
    onProgress(completedBytes) {
      const now = Date.now()
      if (now - lastPersisted >= 150) {
        application.clipboard.progressUpload(expectation, completedBytes)
        lastPersisted = now
      }
    },
  })
  application.clipboard.recordUploadedObject(expectation, stored)
  return context.json({ size: stored.size, sha256: stored.sha256 })
}

export function registerAdminClipboardRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string, status: 200 | 202 | 204 = 200, binaryContent = false) => operation({
    operationId, tags: ["Admin clipboard"], summary, auth: true, scheme: "adminSession", status, binary: binaryContent,
  })
  router.get("/items", doc("listAdminItems", "List clipboard items"), (context) => context.json(application.clipboard.list({
    ...(context.req.query("channelId") ? { channelId: context.req.query("channelId") } : {}),
    ...(context.req.query("deviceId") ? { deviceId: context.req.query("deviceId") } : {}),
    ...(context.req.query("mimeType") ? { mimeType: context.req.query("mimeType") } : {}),
    ...(context.req.query("query") ? { query: context.req.query("query") } : {}),
    ...(context.req.query("cursor") ? { cursor: context.req.query("cursor") } : {}),
    limit: integerQuery(context.req.query("limit"), 50, 1, 200),
  })))
  router.get("/items/:itemId", doc("getAdminItem", "Get clipboard item"), (context) => context.json(application.clipboard.adminItem(context.req.param("itemId"))))
  router.delete("/items/:itemId", doc("deleteAdminItem", "Delete clipboard item", 204), (context) => { application.clipboard.deleteItem(context.req.param("itemId")); return context.body(null, 204) })
  router.get("/items/:itemId/previews/:previewId", doc("getAdminPreview", "Download clipboard preview", 200, true), (context) => binary(
    application.clipboard.adminPreview(context.req.param("itemId"), context.req.param("previewId")),
  ))
  router.post("/items/:itemId/contents/:contentId/requests", doc("requestAdminContent", "Request clipboard content", 202), (context) => {
    const item = application.clipboard.adminItem(context.req.param("itemId"))
    return context.json(application.clipboard.requestContent({
      requesterKind: "admin", requesterId: "admin", channelId: item.channelId,
      itemId: item.id, contentId: context.req.param("contentId"),
    }), 202)
  })
  router.get("/items/:itemId/contents/:contentId", doc("getAdminContent", "Download clipboard content", 200, true), (context) => binary(
    application.clipboard.adminContent(context.req.param("itemId"), context.req.param("contentId")),
  ))
}

export function registerDeviceClipboardRoutes(router: Hono<HttpEnvironment>, application: Application): void {
  const doc = (operationId: string, summary: string, status: 200 | 201 | 202 | 204 = 200, binaryContent = false, tag = "Clipboard") => operation({
    operationId, tags: [tag], summary, auth: true, scheme: "deviceKey", status, binary: binaryContent,
  })
  router.get("/status", doc("getServerStatus", "Get server status", 200, false, "Device"), (context) => context.json(application.clipboard.status()))
  router.post("/channels/:channelId/items", doc("createClipboardItem", "Publish clipboard item", 201), validator("json", ItemManifestSchema), (context) => context.json(
    application.clipboard.createPublication(context.get("device").deviceId, context.req.param("channelId"), context.req.valid("json")), 201,
  ))
  router.get("/channels/:channelId/changes", doc("listClipboardChanges", "List clipboard changes"), (context) => context.json(application.clipboard.changes(
    context.get("device").deviceId, context.req.param("channelId"), context.req.query("cursor"),
    integerQuery(context.req.query("limit"), 200, 1, 1_000),
  )))
  router.get("/channels/:channelId/items", doc("listDeviceItems", "List clipboard items"), (context) => context.json(application.clipboard.list({
    channelId: context.req.param("channelId"),
    ...(context.req.query("query") ? { query: context.req.query("query") } : {}),
    ...(context.req.query("cursor") ? { cursor: context.req.query("cursor") } : {}),
    limit: integerQuery(context.req.query("limit"), 100, 1, 200),
    memberDeviceId: context.get("device").deviceId,
  })))
  router.get("/channels/:channelId/items/:itemId", doc("getDeviceItem", "Get clipboard item"), (context) => context.json(application.clipboard.item(
    context.get("device").deviceId, context.req.param("channelId"), context.req.param("itemId"),
  )))
  router.delete("/channels/:channelId/items/:itemId", doc("deleteDeviceItem", "Delete clipboard item", 204), (context) => {
    application.clipboard.deleteItem(context.req.param("itemId"), context.req.param("channelId"), context.get("device").deviceId)
    return context.body(null, 204)
  })
  router.get("/channels/:channelId/items/:itemId/previews/:previewId", doc("getDevicePreview", "Download clipboard preview", 200, true), (context) => binary(application.clipboard.preview(
    context.get("device").deviceId, context.req.param("channelId"),
    context.req.param("itemId"), context.req.param("previewId"),
  )))
  router.post("/channels/:channelId/items/:itemId/contents/:contentId/requests", doc("requestDeviceContent", "Request clipboard content", 202), (context) => context.json(
    application.clipboard.requestContent({
      requesterKind: "device", requesterId: context.get("device").deviceId,
      memberDeviceId: context.get("device").deviceId, channelId: context.req.param("channelId"),
      itemId: context.req.param("itemId"), contentId: context.req.param("contentId"),
    }), 202,
  ))
  router.get("/channels/:channelId/items/:itemId/contents/:contentId", doc("getDeviceContent", "Download clipboard content", 200, true), (context) => binary(application.clipboard.content(
    context.get("device").deviceId, context.req.param("channelId"),
    context.req.param("itemId"), context.req.param("contentId"),
  )))
  router.put("/uploads/:uploadId/previews/:previewId", doc("uploadPreview", "Upload clipboard preview"), (context) => upload(application, context, "preview"))
  router.put("/uploads/:uploadId/contents/:contentId", doc("uploadContent", "Upload clipboard content"), (context) => upload(application, context, "content"))
  router.post("/uploads/:uploadId/complete", doc("completeUpload", "Complete upload"), (context) => context.json(
    application.clipboard.completeUpload(context.req.param("uploadId"), context.get("device").deviceId),
  ))
  router.get("/work", doc("listDeviceWork", "List pending device work", 200, false, "Work"), (context) => context.json(application.clipboard.work(
    context.get("device").deviceId, context.req.query("cursor"), integerQuery(context.req.query("limit"), 100, 1, 1_000),
  )))
  router.post("/work/:workId/accept", doc("acceptDeviceWork", "Accept device work", 200, false, "Work"), (context) => context.json(
    application.clipboard.acceptWork(context.get("device").deviceId, context.req.param("workId")),
  ))
  router.post("/work/:workId/reject", doc("rejectDeviceWork", "Reject device work", 204, false, "Work"), validator("json", WorkRejectionSchema), (context) => {
    const input = context.req.valid("json")
    application.clipboard.rejectWork(context.get("device").deviceId, context.req.param("workId"), input.code, input.message)
    return context.body(null, 204)
  })
}
