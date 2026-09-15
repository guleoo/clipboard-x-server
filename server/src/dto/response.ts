import { zz } from "../frame/zod"
import { DeviceIconSchema, MimeTypeSchema, Sha256Schema, UuidSchema } from "../common/validation"

const epoch = zz.number().int().nonnegative()
const DeviceKeySchema = zz.object({
  id: UuidSchema, createdAt: epoch, expiresAt: epoch.optional(), revokedAt: epoch.optional(),
}).meta({ $id: "DeviceKey" })
const DeviceSchema = zz.object({
  id: UuidSchema,
  tag: zz.string(),
  iconKind: DeviceIconSchema,
  state: zz.string(),
  lastSeenAt: epoch,
  disabledAt: epoch.optional(),
  deletedAt: epoch.optional(),
  createdAt: epoch,
  updatedAt: epoch,
  keys: zz.array(DeviceKeySchema).optional(),
}).meta({ $id: "Device" })
const IssuedDeviceKeySchema = DeviceKeySchema.extend({ key: zz.string() }).meta({ $id: "IssuedDeviceKey" })
const ChannelSchema = zz.object({
  id: UuidSchema,
  name: zz.string(),
  createdAt: epoch,
  updatedAt: epoch,
  members: zz.array(DeviceSchema.pick({ id: true, tag: true, iconKind: true, state: true })).optional(),
}).meta({ $id: "Channel" })
const TransferSchema = zz.object({
  id: UuidSchema,
  itemId: UuidSchema,
  deviceId: UuidSchema,
  kind: zz.enum(["publish", "content"]),
  direction: zz.enum(["upload", "download"]),
  state: zz.enum(["queued", "waiting-for-peer", "transferring", "verifying", "completed", "failed", "cancelled", "expired"]),
  completedBytes: epoch,
  totalBytes: epoch,
  peerDeviceIds: zz.array(UuidSchema),
  createdAt: epoch,
  updatedAt: epoch,
  error: zz.object({ code: zz.string(), message: zz.string() }),
}).meta({ $id: "Transfer" })
const RepresentationSchema = zz.object({
  id: zz.string(), mimeType: MimeTypeSchema, size: epoch, sha256: Sha256Schema,
  delivery: zz.enum(["eager", "on-demand"]), availability: zz.string(),
}).meta({ $id: "Representation" })
const PreviewSchema = zz.object({
  id: zz.string(), contentId: zz.string(), mimeType: MimeTypeSchema,
  size: epoch, sha256: Sha256Schema, truncated: zz.boolean(),
}).meta({ $id: "Preview" })
const ItemSchema = zz.object({
  id: UuidSchema,
  channelId: UuidSchema,
  channelName: zz.string(),
  createdAt: epoch,
  updatedAt: epoch,
  origin: zz.object({ deviceId: UuidSchema, tag: zz.string(), iconKind: DeviceIconSchema }),
  contents: zz.array(RepresentationSchema),
  previews: zz.array(PreviewSchema),
}).meta({ $id: "ClipboardItem" })
const PublicationSchema = zz.object({
  itemId: UuidSchema,
  uploadId: UuidSchema,
  previewIds: zz.array(zz.string()),
  contentIds: zz.array(zz.string()),
  transfer: TransferSchema,
}).meta({ $id: "Publication" })
const ItemPageSchema = zz.object({ items: zz.array(ItemSchema), cursor: zz.string(), hasMore: zz.boolean() })
  .meta({ $id: "ClipboardItemPage" })
const TransferListSchema = zz.object({ transfers: zz.array(TransferSchema) }).meta({ $id: "TransferList" })
const ContentRequestSchema = zz.object({ transfer: TransferSchema }).meta({ $id: "ContentRequest" })
const HealthSchema = zz.object({ status: zz.enum(["ok", "ready", "not-ready"]), failed: zz.array(zz.string()).optional() })
  .meta({ $id: "Health" })
const WorkPageSchema = zz.object({
  cursor: zz.string(), hasMore: zz.boolean(), work: zz.array(zz.object({
    id: UuidSchema, type: zz.literal("materialize-content"), itemId: UuidSchema, contentId: zz.string(),
  })),
}).meta({ $id: "WorkPage" })

export const ErrorResponseSchema = zz.object({ error: zz.object({
  code: zz.string(), message: zz.string(), requestId: zz.string(), details: zz.record(zz.string(), zz.unknown()),
}) }).meta({ $id: "ErrorResponse" })

export const operationResponseSchemas: Readonly<Record<string, zz.ZodType>> = Object.freeze({
  getLiveness: HealthSchema,
  getReadiness: HealthSchema,
  getDevice: DeviceSchema,
  updateDeviceProfile: DeviceSchema,
  listDeviceChannels: zz.object({ channels: zz.array(ChannelSchema) }),
  getServerStatus: zz.object({
    apiVersion: zz.literal(1), serverVersion: zz.string(), state: zz.string(),
    capabilities: zz.object({ supportedMimeTypes: zz.array(MimeTypeSchema), maxItemBytes: epoch, maxPreviewBytes: epoch }),
    pendingItems: epoch, activeTransfers: epoch, lastSyncAt: epoch, revision: epoch,
  }).meta({ $id: "ServerStatus" }),
  createClipboardItem: PublicationSchema,
  listClipboardChanges: zz.object({
    cursor: zz.string(), hasMore: zz.boolean(), changes: zz.array(zz.object({
      sequence: epoch, kind: zz.enum(["upsert", "remove"]), itemId: UuidSchema, reason: zz.string(),
    })),
  }).meta({ $id: "ClipboardChangePage" }),
  listDeviceItems: ItemPageSchema,
  getDeviceItem: ItemSchema,
  requestDeviceContent: ContentRequestSchema,
  uploadPreview: zz.object({ size: epoch, sha256: Sha256Schema }),
  uploadContent: zz.object({ size: epoch, sha256: Sha256Schema }),
  completeUpload: ContentRequestSchema,
  listDeviceWork: WorkPageSchema,
  acceptDeviceWork: zz.object({ uploadId: UuidSchema, transfer: TransferSchema }),
  listDeviceTransfers: TransferListSchema,
  getDeviceTransfer: TransferSchema,
  cancelDeviceTransfer: TransferSchema,
  createAdminSession: zz.object({
    administrator: zz.object({ id: zz.literal(1), username: zz.string(), createdAt: epoch }), expiresAt: epoch,
  }).meta({ $id: "AdminSession" }),
  getAdminSession: zz.object({ administrator: zz.object({ id: zz.literal(1), username: zz.string(), createdAt: epoch }) }),
  getAdminOverview: zz.record(zz.string(), zz.unknown()),
  listDevices: zz.object({ devices: zz.array(DeviceSchema) }),
  createDevice: DeviceSchema,
  updateDevice: DeviceSchema,
  createDeviceKey: IssuedDeviceKeySchema,
  listChannels: zz.object({ channels: zz.array(ChannelSchema) }),
  createChannel: ChannelSchema,
  updateChannel: ChannelSchema,
  listAdminItems: ItemPageSchema,
  getAdminItem: ItemSchema,
  requestAdminContent: ContentRequestSchema,
  listAdminTransfers: TransferListSchema,
  getAdminTransfer: TransferSchema,
  cancelAdminTransfer: TransferSchema,
})
