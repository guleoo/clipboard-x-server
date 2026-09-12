import { Hono, type Context } from "hono"
import { z } from "zod"
import type { Application } from "../application"
import { DomainError } from "../common/error"
import {
  ContentIdSchema,
  DeviceIconSchema,
  MimeTypeSchema,
  SafeTextSchema,
  Sha256Schema,
  UuidSchema,
} from "../common/validation"
import { integerQuery, json } from "../http/input"
import type { HttpEnvironment } from "../http/types"

const ProfileSchema = z.object({
  tag: SafeTextSchema(256).min(1),
  iconKind: DeviceIconSchema,
})

const RepresentationSchema = z.object({
  id: ContentIdSchema,
  mimeType: MimeTypeSchema,
  size: z.number().int().nonnegative(),
  sha256: Sha256Schema,
  delivery: z.enum(["eager", "on-demand"]),
})

const PreviewSchema = z.object({
  id: ContentIdSchema,
  contentId: ContentIdSchema,
  mimeType: MimeTypeSchema,
  size: z.number().int().nonnegative(),
  sha256: Sha256Schema,
  truncated: z.boolean(),
})

const ManifestSchema = z.object({
  id: UuidSchema,
  createdAt: z.number().int().nonnegative(),
  originDeviceId: UuidSchema,
  contents: z.array(RepresentationSchema).min(1).max(16),
  previews: z.array(PreviewSchema).max(16).default([]),
}).superRefine((manifest, context) => {
  const contents = new Set(manifest.contents.map((value) => value.id))
  if (contents.size !== manifest.contents.length) {
    context.addIssue({ code: "custom", path: ["contents"], message: "Content IDs must be unique" })
  }
  const previews = new Set(manifest.previews.map((value) => value.id))
  if (previews.size !== manifest.previews.length) {
    context.addIssue({ code: "custom", path: ["previews"], message: "Preview IDs must be unique" })
  }
  for (const [index, preview] of manifest.previews.entries()) {
    if (!contents.has(preview.contentId)) {
      context.addIssue({ code: "custom", path: ["previews", index, "contentId"], message: "Preview contentId is unknown" })
    }
  }
})

const WorkRejectionSchema = z.object({
  code: z.enum(["source_content_missing", "upload_failed", "cancelled"]),
  message: SafeTextSchema(512).default(""),
})

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

async function upload(
  application: Application,
  c: Context<HttpEnvironment>,
  kind: "preview" | "content",
): Promise<Response> {
  const identity = c.get("device")
  const expectation = application.clipboard.uploadExpectation(
    c.req.param("uploadId") ?? "",
    kind,
    c.req.param(kind === "preview" ? "previewId" : "contentId") ?? "",
    identity.deviceId,
  )
  const contentLength = Number(c.req.header("content-length"))
  if (!Number.isSafeInteger(contentLength) || contentLength !== expectation.expected_size) {
    throw new DomainError("invalid_request", "Content-Length must match the manifest", 400)
  }
  const contentType = c.req.header("content-type")?.toLowerCase()
  if (contentType !== expectation.mime_type.toLowerCase()) {
    throw new DomainError("invalid_request", "Content-Type must match the manifest", 400)
  }
  let lastPersisted = 0
  const stored = await application.objects.write(c.req.raw.body, {
    size: expectation.expected_size,
    sha256: expectation.expected_sha256,
    maximumBytes: kind === "preview" ? application.config.maxPreviewBytes : application.config.maxObjectBytes,
    signal: c.req.raw.signal,
    onProgress(completedBytes) {
      const now = Date.now()
      if (now - lastPersisted >= 150) {
        application.clipboard.progressUpload(expectation, completedBytes)
        lastPersisted = now
      }
    },
  })
  application.clipboard.recordUploadedObject(expectation, stored)
  return c.json({ size: stored.size, sha256: stored.sha256 })
}

export function createDeviceApi(application: Application): Hono<HttpEnvironment> {
  const api = new Hono<HttpEnvironment>()

  api.get("/status", (c) => c.json(application.clipboard.status()))
  api.get("/device", (c) => c.json(application.devices.get(c.get("device").deviceId)))
  api.put("/device/profile", async (c) => {
    const input = await json(c, ProfileSchema)
    return c.json(application.devices.updateProfile(c.get("device").deviceId, input))
  })
  api.get("/channels", (c) => c.json({ channels: application.channels.listForDevice(c.get("device").deviceId) }))

  api.post("/channels/:channelId/items", async (c) => {
    const manifest = await json(c, ManifestSchema)
    return c.json(application.clipboard.createPublication(
      c.get("device").deviceId,
      c.req.param("channelId"),
      manifest,
    ), 201)
  })
  api.get("/channels/:channelId/changes", (c) => c.json(application.clipboard.changes(
    c.get("device").deviceId,
    c.req.param("channelId"),
    c.req.query("cursor"),
    integerQuery(c.req.query("limit"), 200, 1, 1_000),
  )))
  api.get("/channels/:channelId/items", (c) => c.json(application.clipboard.list({
    channelId: c.req.param("channelId"),
    ...(c.req.query("query") ? { query: c.req.query("query") } : {}),
    ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
    limit: integerQuery(c.req.query("limit"), 100, 1, 200),
    memberDeviceId: c.get("device").deviceId,
  })))
  api.get("/channels/:channelId/items/:itemId", (c) => c.json(application.clipboard.item(
    c.get("device").deviceId,
    c.req.param("channelId"),
    c.req.param("itemId"),
  )))
  api.delete("/channels/:channelId/items/:itemId", (c) => {
    application.clipboard.deleteItem(
      c.req.param("itemId"),
      c.req.param("channelId"),
      c.get("device").deviceId,
    )
    return c.body(null, 204)
  })
  api.get("/channels/:channelId/items/:itemId/previews/:previewId", (c) => binary(
    application.clipboard.preview(
      c.get("device").deviceId,
      c.req.param("channelId"),
      c.req.param("itemId"),
      c.req.param("previewId"),
    ),
  ))
  api.post("/channels/:channelId/items/:itemId/contents/:contentId/requests", (c) => c.json(
    application.clipboard.requestContent({
      requesterKind: "device",
      requesterId: c.get("device").deviceId,
      memberDeviceId: c.get("device").deviceId,
      channelId: c.req.param("channelId"),
      itemId: c.req.param("itemId"),
      contentId: c.req.param("contentId"),
    }),
    202,
  ))
  api.get("/channels/:channelId/items/:itemId/contents/:contentId", (c) => binary(
    application.clipboard.content(
      c.get("device").deviceId,
      c.req.param("channelId"),
      c.req.param("itemId"),
      c.req.param("contentId"),
    ),
  ))

  api.put("/uploads/:uploadId/previews/:previewId", (c) => upload(application, c, "preview"))
  api.put("/uploads/:uploadId/contents/:contentId", (c) => upload(application, c, "content"))
  api.post("/uploads/:uploadId/complete", (c) => c.json(application.clipboard.completeUpload(
    c.req.param("uploadId"),
    c.get("device").deviceId,
  )))

  api.get("/transfers", (c) => c.json({ transfers: application.transfers.list(c.get("device").deviceId) }))
  api.get("/transfers/:transferId", (c) => c.json(application.transfers.get(
    c.req.param("transferId"),
    c.get("device").deviceId,
  )))
  api.delete("/transfers/:transferId", (c) => c.json(application.transfers.cancel(
    c.req.param("transferId"),
    c.get("device").deviceId,
  )))

  api.get("/work", (c) => c.json(application.clipboard.work(
    c.get("device").deviceId,
    c.req.query("cursor"),
    integerQuery(c.req.query("limit"), 100, 1, 1_000),
  )))
  api.post("/work/:workId/accept", (c) => c.json(application.clipboard.acceptWork(
    c.get("device").deviceId,
    c.req.param("workId"),
  )))
  api.post("/work/:workId/reject", async (c) => {
    const input = await json(c, WorkRejectionSchema)
    application.clipboard.rejectWork(c.get("device").deviceId, c.req.param("workId"), input.code, input.message)
    return c.body(null, 204)
  })

  return api
}
