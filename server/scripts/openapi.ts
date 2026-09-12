import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"

const error = {
  description: "Structured error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
}
const json = (schema: unknown, description = "Successful response") => ({
  description,
  content: { "application/json": { schema } },
})
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const parameter = (name: string, where: "path" | "query", required = where === "path") => ({
  name,
  in: where,
  required,
  schema: { type: "string" },
})
const body = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
})
const standardErrors = { "400": error, "401": error, "403": error, "404": error, "409": error, "413": error, "422": error, "429": error }
const secured = [{ deviceKey: [] }]
const administered = [{ adminSession: [] }]

const document = {
  openapi: "3.1.0",
  info: {
    title: "Clipboard X Server API",
    version: "0.1.0",
    description: "Device synchronization API and same-origin single-administrator API.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Health" }, { name: "Device" }, { name: "Clipboard" }, { name: "Work" },
    { name: "Admin authentication" }, { name: "Admin devices" }, { name: "Admin channels" },
    { name: "Admin clipboard" }, { name: "Admin transfers" },
  ],
  paths: {
    "/health/live": { get: { tags: ["Health"], responses: { "200": json(ref("Health")) } } },
    "/health/ready": { get: { tags: ["Health"], responses: { "200": json(ref("Health")), "503": json(ref("Health")) } } },
    "/api/v1/status": { get: { tags: ["Device"], security: secured, responses: { "200": json(ref("Status")), ...standardErrors } } },
    "/api/v1/device": { get: { tags: ["Device"], security: secured, responses: { "200": json(ref("Device")), ...standardErrors } } },
    "/api/v1/device/profile": { put: { tags: ["Device"], security: secured, requestBody: body(ref("DeviceProfile")), responses: { "200": json(ref("Device")), ...standardErrors } } },
    "/api/v1/channels": { get: { tags: ["Device"], security: secured, responses: { "200": json({ type: "object", required: ["channels"], properties: { channels: { type: "array", items: ref("Channel") } } }), ...standardErrors } } },
    "/api/v1/channels/{channelId}/items": {
      parameters: [parameter("channelId", "path")],
      post: { tags: ["Clipboard"], security: secured, requestBody: body(ref("Manifest")), responses: { "201": json(ref("Publication")), ...standardErrors } },
      get: { tags: ["Clipboard"], security: secured, parameters: [parameter("cursor", "query", false), parameter("limit", "query", false), parameter("query", "query", false)], responses: { "200": json(ref("ItemPage")), ...standardErrors } },
    },
    "/api/v1/channels/{channelId}/changes": { get: { tags: ["Clipboard"], security: secured, parameters: [parameter("channelId", "path"), parameter("cursor", "query", false), parameter("limit", "query", false)], responses: { "200": json(ref("ChangePage")), ...standardErrors } } },
    "/api/v1/channels/{channelId}/items/{itemId}": {
      parameters: [parameter("channelId", "path"), parameter("itemId", "path")],
      get: { tags: ["Clipboard"], security: secured, responses: { "200": json(ref("Item")), ...standardErrors } },
      delete: { tags: ["Clipboard"], security: secured, responses: { "204": { description: "Deleted" }, ...standardErrors } },
    },
    "/api/v1/channels/{channelId}/items/{itemId}/previews/{previewId}": { get: { tags: ["Clipboard"], security: secured, parameters: [parameter("channelId", "path"), parameter("itemId", "path"), parameter("previewId", "path")], responses: { "200": { description: "Preview bytes", content: { "*/*": { schema: { type: "string", contentEncoding: "binary" } } } }, ...standardErrors } } },
    "/api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}/requests": { post: { tags: ["Clipboard"], security: secured, parameters: [parameter("channelId", "path"), parameter("itemId", "path"), parameter("contentId", "path")], requestBody: body({ type: "object", additionalProperties: false }), responses: { "202": json(ref("ContentRequest")), ...standardErrors } } },
    "/api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}": { get: { tags: ["Clipboard"], security: secured, parameters: [parameter("channelId", "path"), parameter("itemId", "path"), parameter("contentId", "path")], responses: { "200": { description: "Content bytes", content: { "*/*": { schema: { type: "string", contentEncoding: "binary" } } } }, ...standardErrors } } },
    "/api/v1/uploads/{uploadId}/previews/{previewId}": { put: { tags: ["Clipboard"], security: secured, parameters: [parameter("uploadId", "path"), parameter("previewId", "path")], requestBody: { required: true, content: { "*/*": { schema: { type: "string", contentEncoding: "binary" } } } }, responses: { "200": json(ref("StoredObject")), ...standardErrors } } },
    "/api/v1/uploads/{uploadId}/contents/{contentId}": { put: { tags: ["Clipboard"], security: secured, parameters: [parameter("uploadId", "path"), parameter("contentId", "path")], requestBody: { required: true, content: { "*/*": { schema: { type: "string", contentEncoding: "binary" } } } }, responses: { "200": json(ref("StoredObject")), ...standardErrors } } },
    "/api/v1/uploads/{uploadId}/complete": { post: { tags: ["Clipboard"], security: secured, parameters: [parameter("uploadId", "path")], responses: { "200": json(ref("ContentRequest")), ...standardErrors } } },
    "/api/v1/transfers": { get: { tags: ["Device"], security: secured, responses: { "200": json({ type: "object", required: ["transfers"], properties: { transfers: { type: "array", items: ref("Transfer") } } }), ...standardErrors } } },
    "/api/v1/transfers/{transferId}": {
      parameters: [parameter("transferId", "path")],
      get: { tags: ["Device"], security: secured, responses: { "200": json(ref("Transfer")), ...standardErrors } },
      delete: { tags: ["Device"], security: secured, responses: { "200": json(ref("Transfer")), ...standardErrors } },
    },
    "/api/v1/work": { get: { tags: ["Work"], security: secured, parameters: [parameter("cursor", "query", false), parameter("limit", "query", false)], responses: { "200": json(ref("WorkPage")), ...standardErrors } } },
    "/api/v1/work/{workId}/accept": { post: { tags: ["Work"], security: secured, parameters: [parameter("workId", "path")], responses: { "200": json(ref("AcceptedWork")), ...standardErrors } } },
    "/api/v1/work/{workId}/reject": { post: { tags: ["Work"], security: secured, parameters: [parameter("workId", "path")], requestBody: body(ref("WorkRejection")), responses: { "204": { description: "Rejected" }, ...standardErrors } } },
    "/admin/api/v1/session": {
      get: { tags: ["Admin authentication"], security: administered, responses: { "200": json(ref("Session")), ...standardErrors } },
      post: { tags: ["Admin authentication"], requestBody: body(ref("Credentials")), responses: { "200": json(ref("Session")), ...standardErrors } },
      delete: { tags: ["Admin authentication"], security: administered, responses: { "204": { description: "Logged out" }, ...standardErrors } },
    },
    "/admin/api/v1/administrator": { patch: { tags: ["Admin authentication"], security: administered, requestBody: body(ref("Credentials")), responses: { "204": { description: "Administrator configuration updated; existing sessions invalidated" }, ...standardErrors } } },
    "/admin/api/v1/overview": { get: { tags: ["Admin clipboard"], security: administered, responses: { "200": json({ type: "object" }), ...standardErrors } } },
    "/admin/api/v1/devices": {
      get: { tags: ["Admin devices"], security: administered, responses: { "200": json({ type: "object", required: ["devices"], properties: { devices: { type: "array", items: ref("Device") } } }), ...standardErrors } },
      post: { tags: ["Admin devices"], security: administered, requestBody: body(ref("DeviceCreate")), responses: { "201": json(ref("Device")), ...standardErrors } },
    },
    "/admin/api/v1/devices/{deviceId}": {
      parameters: [parameter("deviceId", "path")],
      patch: { tags: ["Admin devices"], security: administered, requestBody: body({ type: "object" }), responses: { "200": json(ref("Device")), ...standardErrors } },
      delete: { tags: ["Admin devices"], security: administered, responses: { "204": { description: "Archived" }, ...standardErrors } },
    },
    "/admin/api/v1/devices/{deviceId}/keys": { post: { tags: ["Admin devices"], security: administered, parameters: [parameter("deviceId", "path")], responses: { "201": json(ref("IssuedDeviceKey")), ...standardErrors } } },
    "/admin/api/v1/devices/{deviceId}/keys/{keyId}": { delete: { tags: ["Admin devices"], security: administered, parameters: [parameter("deviceId", "path"), parameter("keyId", "path")], responses: { "204": { description: "Revoked" }, ...standardErrors } } },
    "/admin/api/v1/channels": {
      get: { tags: ["Admin channels"], security: administered, responses: { "200": json({ type: "object", required: ["channels"], properties: { channels: { type: "array", items: ref("Channel") } } }), ...standardErrors } },
      post: { tags: ["Admin channels"], security: administered, requestBody: body({ type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 256 } } }), responses: { "201": json(ref("Channel")), ...standardErrors } },
    },
    "/admin/api/v1/channels/{channelId}": {
      parameters: [parameter("channelId", "path")],
      patch: { tags: ["Admin channels"], security: administered, requestBody: body({ type: "object", required: ["name"], properties: { name: { type: "string" } } }), responses: { "200": json(ref("Channel")), ...standardErrors } },
      delete: { tags: ["Admin channels"], security: administered, responses: { "204": { description: "Deleted" }, ...standardErrors } },
    },
    "/admin/api/v1/channels/{channelId}/members/{deviceId}": {
      parameters: [parameter("channelId", "path"), parameter("deviceId", "path")],
      put: { tags: ["Admin channels"], security: administered, responses: { "204": { description: "Member added" }, ...standardErrors } },
      delete: { tags: ["Admin channels"], security: administered, responses: { "204": { description: "Member removed" }, ...standardErrors } },
    },
    "/admin/api/v1/items": { get: { tags: ["Admin clipboard"], security: administered, parameters: [parameter("channelId", "query", false), parameter("deviceId", "query", false), parameter("mimeType", "query", false), parameter("query", "query", false), parameter("cursor", "query", false), parameter("limit", "query", false)], responses: { "200": json(ref("ItemPage")), ...standardErrors } } },
    "/admin/api/v1/items/{itemId}": {
      parameters: [parameter("itemId", "path")],
      get: { tags: ["Admin clipboard"], security: administered, responses: { "200": json(ref("Item")), ...standardErrors } },
      delete: { tags: ["Admin clipboard"], security: administered, responses: { "204": { description: "Deleted" }, ...standardErrors } },
    },
    "/admin/api/v1/items/{itemId}/previews/{previewId}": { get: { tags: ["Admin clipboard"], security: administered, parameters: [parameter("itemId", "path"), parameter("previewId", "path")], responses: { "200": { description: "Preview bytes" }, ...standardErrors } } },
    "/admin/api/v1/items/{itemId}/contents/{contentId}/requests": { post: { tags: ["Admin clipboard"], security: administered, parameters: [parameter("itemId", "path"), parameter("contentId", "path")], responses: { "202": json(ref("ContentRequest")), ...standardErrors } } },
    "/admin/api/v1/items/{itemId}/contents/{contentId}": { get: { tags: ["Admin clipboard"], security: administered, parameters: [parameter("itemId", "path"), parameter("contentId", "path")], responses: { "200": { description: "Content bytes" }, ...standardErrors } } },
    "/admin/api/v1/transfers": { get: { tags: ["Admin transfers"], security: administered, parameters: [parameter("limit", "query", false)], responses: { "200": json({ type: "object", required: ["transfers"], properties: { transfers: { type: "array", items: ref("Transfer") } } }), ...standardErrors } } },
    "/admin/api/v1/transfers/{transferId}": {
      parameters: [parameter("transferId", "path")],
      get: { tags: ["Admin transfers"], security: administered, responses: { "200": json(ref("Transfer")), ...standardErrors } },
      delete: { tags: ["Admin transfers"], security: administered, responses: { "200": json(ref("Transfer")), ...standardErrors } },
    },
  },
  components: {
    securitySchemes: {
      deviceKey: { type: "http", scheme: "bearer", bearerFormat: "cbx_<keyId>_<secret>", description: "Also requires X-Clipboard-X-Device-Id." },
      adminSession: { type: "apiKey", in: "cookie", name: "clipboard_x_admin" },
    },
    schemas: {
      Uuid: { type: "string", format: "uuid", pattern: "^[0-9a-fA-F-]{36}$" },
      Sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      Health: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok", "ready", "not-ready"] } } },
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message", "requestId", "details"], properties: { code: { type: "string" }, message: { type: "string" }, requestId: { type: "string" }, details: { type: "object" } } } } },
      DeviceProfile: { type: "object", additionalProperties: false, required: ["tag", "iconKind"], properties: { tag: { type: "string", minLength: 1, maxLength: 256 }, iconKind: { type: "string", enum: ["desktop", "laptop", "phone", "tablet", "server", "other"] } } },
      DeviceCreate: { allOf: [ref("DeviceProfile"), { type: "object", required: ["id"], properties: { id: ref("Uuid") } }] },
      Device: { allOf: [ref("DeviceProfile"), { type: "object", required: ["id", "state", "lastSeenAt"], properties: { id: ref("Uuid"), state: { type: "string" }, lastSeenAt: { type: "integer", minimum: 0 }, disabledAt: { type: "integer" }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, keys: { type: "array", items: ref("DeviceKey") } } }] },
      DeviceKey: { type: "object", required: ["id", "createdAt"], properties: { id: ref("Uuid"), createdAt: { type: "integer" }, expiresAt: { type: "integer" }, revokedAt: { type: "integer" } } },
      IssuedDeviceKey: { allOf: [ref("DeviceKey"), { type: "object", required: ["key"], properties: { key: { type: "string", writeOnly: true } } }] },
      Channel: { type: "object", required: ["id", "name"], properties: { id: ref("Uuid"), name: { type: "string" }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, members: { type: "array", items: ref("Device") } } },
      Representation: { type: "object", required: ["id", "mimeType", "size", "sha256", "delivery"], properties: { id: { type: "string", maxLength: 128 }, mimeType: { type: "string" }, size: { type: "integer", minimum: 0 }, sha256: ref("Sha256"), delivery: { type: "string", enum: ["eager", "on-demand"] }, availability: { type: "string", enum: ["available", "source-required", "requesting", "expired", "failed"] } } },
      Preview: { type: "object", required: ["id", "contentId", "mimeType", "size", "sha256", "truncated"], properties: { id: { type: "string" }, contentId: { type: "string" }, mimeType: { type: "string" }, size: { type: "integer" }, sha256: ref("Sha256"), truncated: { type: "boolean" } } },
      Manifest: { type: "object", additionalProperties: false, required: ["id", "createdAt", "originDeviceId", "contents", "previews"], properties: { id: ref("Uuid"), createdAt: { type: "integer", minimum: 0 }, originDeviceId: ref("Uuid"), contents: { type: "array", minItems: 1, maxItems: 16, items: ref("Representation") }, previews: { type: "array", maxItems: 16, items: ref("Preview") } } },
      Item: { type: "object", required: ["id", "channelId", "channelName", "createdAt", "updatedAt", "origin", "contents", "previews"], properties: { id: ref("Uuid"), channelId: ref("Uuid"), channelName: { type: "string" }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, origin: { type: "object", required: ["deviceId", "tag", "iconKind"], properties: { deviceId: ref("Uuid"), tag: { type: "string" }, iconKind: { type: "string" } } }, contents: { type: "array", items: ref("Representation") }, previews: { type: "array", items: ref("Preview") } } },
      Transfer: { type: "object", required: ["id", "itemId", "deviceId", "kind", "direction", "state", "completedBytes", "totalBytes", "peerDeviceIds", "createdAt", "updatedAt", "error"], properties: { id: ref("Uuid"), itemId: ref("Uuid"), deviceId: ref("Uuid"), kind: { type: "string", enum: ["publish", "content"] }, direction: { type: "string", enum: ["upload", "download"] }, state: { type: "string", enum: ["queued", "waiting-for-peer", "transferring", "verifying", "completed", "failed", "cancelled", "expired"] }, completedBytes: { type: "integer", minimum: 0 }, totalBytes: { type: "integer", minimum: 0 }, peerDeviceIds: { type: "array", items: ref("Uuid") }, createdAt: { type: "integer" }, updatedAt: { type: "integer" }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } },
      Publication: { type: "object", required: ["itemId", "uploadId", "previewIds", "contentIds", "transfer"], properties: { itemId: ref("Uuid"), uploadId: ref("Uuid"), previewIds: { type: "array", items: { type: "string" } }, contentIds: { type: "array", items: { type: "string" } }, transfer: ref("Transfer") } },
      ContentRequest: { type: "object", required: ["transfer"], properties: { transfer: ref("Transfer") } },
      StoredObject: { type: "object", required: ["size", "sha256"], properties: { size: { type: "integer" }, sha256: ref("Sha256") } },
      ItemPage: { type: "object", required: ["items", "cursor", "hasMore"], properties: { items: { type: "array", items: ref("Item") }, cursor: { type: "string" }, hasMore: { type: "boolean" } } },
      ChangePage: { type: "object", required: ["cursor", "hasMore", "changes"], properties: { cursor: { type: "string" }, hasMore: { type: "boolean" }, changes: { type: "array", items: { type: "object", required: ["sequence", "kind", "itemId", "reason"], properties: { sequence: { type: "integer" }, kind: { type: "string", enum: ["upsert", "remove"] }, itemId: ref("Uuid"), reason: { type: "string" } } } } } },
      WorkPage: { type: "object", required: ["cursor", "hasMore", "work"], properties: { cursor: { type: "string" }, hasMore: { type: "boolean" }, work: { type: "array", items: { type: "object", required: ["id", "type", "itemId", "contentId"], properties: { id: ref("Uuid"), type: { const: "materialize-content" }, itemId: ref("Uuid"), contentId: { type: "string" } } } } } },
      AcceptedWork: { type: "object", required: ["uploadId", "transfer"], properties: { uploadId: ref("Uuid"), transfer: ref("Transfer") } },
      WorkRejection: { type: "object", required: ["code"], properties: { code: { type: "string", enum: ["source_content_missing", "upload_failed", "cancelled"] }, message: { type: "string", maxLength: 512 } } },
      Status: { type: "object", required: ["apiVersion", "serverVersion", "state", "capabilities", "pendingItems", "activeTransfers", "lastSyncAt", "revision"], properties: { apiVersion: { const: 1 }, serverVersion: { type: "string" }, state: { type: "string", enum: ["online", "degraded"] }, capabilities: { type: "object", required: ["supportedMimeTypes", "maxItemBytes", "maxPreviewBytes"], properties: { supportedMimeTypes: { type: "array", items: { type: "string" } }, maxItemBytes: { type: "integer" }, maxPreviewBytes: { type: "integer" } } }, pendingItems: { type: "integer" }, activeTransfers: { type: "integer" }, lastSyncAt: { type: "integer" }, revision: { type: "integer" } } },
      Credentials: { type: "object", additionalProperties: false, required: ["username", "password"], properties: { username: { type: "string", minLength: 3, maxLength: 64 }, password: { type: "string", minLength: 7, maxLength: 256, format: "password" } } },
      Session: { type: "object", required: ["administrator"], properties: { administrator: { type: "object", required: ["id", "username", "createdAt"], properties: { id: { const: 1 }, username: { type: "string" }, createdAt: { type: "integer" } } }, expiresAt: { type: "integer" } } },
    },
  },
} as const

const target = resolve(import.meta.dir, "../openapi/openapi.json")
const rendered = `${JSON.stringify(document, null, 2)}\n`
if (process.argv.includes("--check")) {
  const current = await Bun.file(target).text().catch(() => "")
  if (current !== rendered) {
    console.error("server/openapi/openapi.json is out of date; run bun run --filter '@clipboard-x/server' openapi")
    process.exit(1)
  }
  console.log("OpenAPI document is current")
} else {
  await mkdir(resolve(import.meta.dir, "../openapi"), { recursive: true })
  await Bun.write(target, rendered)
  console.log(`Wrote ${target}`)
}
