import { z } from "zod"

const Identifier = z.string().min(1)
const Timestamp = z.number().int().nonnegative()
const HexColor = z.string().regex(/^#[0-9a-f]{6}$/u)
const IconColor = z.object({ light: HexColor, dark: HexColor.optional() })
const DeviceIcon = z.string().min(1).max(128).refine((value) => !/[\r\n\0]/u.test(value))

export const AdministratorSchema = z.object({ id: z.literal(1), username: z.string(), createdAt: Timestamp })
export const RetentionSchema = z.object({
  maxItemsPerDevice: z.number().int().positive().optional(),
  maxItemsPerChannel: z.number().int().positive().optional(),
  maxAgeMillis: z.number().int().positive().optional(),
  sweepIntervalMillis: z.number().int().min(60_000).max(86_400_000),
})
export const DeviceKeySchema = z.object({
  id: Identifier,
  createdAt: Timestamp,
  expiresAt: Timestamp.optional(),
  revokedAt: Timestamp.optional(),
})
export const DeviceSchema = z.object({
  id: Identifier,
  tag: z.string(),
  iconKind: DeviceIcon,
  iconColor: IconColor,
  state: z.string(),
  lastSeenAt: Timestamp,
  disabledAt: Timestamp.optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  kind: z.enum(["client", "virtual"]),
  keys: z.array(DeviceKeySchema),
})
export const IssuedDeviceKeySchema = DeviceKeySchema.extend({ key: z.string().min(1) })
export const ChannelMemberSchema = z.object({
  id: Identifier,
  tag: z.string(),
  iconKind: DeviceIcon,
  iconColor: IconColor,
  state: z.string(),
  kind: z.enum(["client", "virtual"]),
})
export const ChannelSchema = z.object({
  id: Identifier,
  name: z.string(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  members: z.array(ChannelMemberSchema),
})
export const ClipboardRepresentationSchema = z.object({
  id: Identifier,
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  delivery: z.enum(["eager", "on-demand"]),
  availability: z.enum(["available", "source-required", "requesting", "expired", "failed"]),
})
export const ClipboardPreviewSchema = z.object({
  id: Identifier,
  contentId: Identifier,
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  truncated: z.boolean(),
})
export const ClipboardItemSchema = z.object({
  id: Identifier,
  channelId: Identifier,
  channelName: z.string(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  origin: z.object({
    deviceId: Identifier,
    tag: z.string(),
    iconKind: DeviceIcon,
    iconColor: IconColor,
    kind: z.enum(["client", "virtual"]),
  }),
  contents: z.array(ClipboardRepresentationSchema),
  previews: z.array(ClipboardPreviewSchema),
})
export const TransferStateSchema = z.enum([
  "queued", "waiting-for-peer", "transferring", "verifying", "completed", "failed", "cancelled", "expired",
])
export const TransferSchema = z.object({
  id: Identifier,
  itemId: Identifier,
  deviceId: z.string(),
  kind: z.enum(["publish", "content"]),
  direction: z.enum(["upload", "download"]),
  state: TransferStateSchema,
  completedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  peerDeviceIds: z.array(z.string()),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  error: z.object({ code: z.string(), message: z.string() }),
})
export const OverviewSchema = z.object({
  devices: z.object({ total: z.number(), online: z.number(), disabled: z.number() }),
  channels: z.number(),
  items: z.number(),
  failedTransfers: z.number(),
  recentTransfers: z.array(TransferSchema.pick({
    id: true, itemId: true, state: true, kind: true, direction: true, updatedAt: true,
  })),
})
export const ClipboardPageSchema = z.object({
  items: z.array(ClipboardItemSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
})
export const PublicationSchema = z.object({
  itemId: Identifier,
  uploadId: Identifier,
  previewIds: z.array(Identifier),
  contentIds: z.array(Identifier),
  transfer: TransferSchema,
})
export const UploadResultSchema = z.object({ size: z.number().int().nonnegative(), sha256: z.string() })
export const UploadCompletionSchema = z.object({ transfer: TransferSchema })

export type Administrator = z.infer<typeof AdministratorSchema>
export type Retention = z.infer<typeof RetentionSchema>
export type DeviceKey = z.infer<typeof DeviceKeySchema>
export type Device = z.infer<typeof DeviceSchema>
export type IssuedDeviceKey = z.infer<typeof IssuedDeviceKeySchema>
export type ChannelMember = z.infer<typeof ChannelMemberSchema>
export type Channel = z.infer<typeof ChannelSchema>
export type ClipboardRepresentation = z.infer<typeof ClipboardRepresentationSchema>
export type ClipboardPreview = z.infer<typeof ClipboardPreviewSchema>
export type ClipboardItem = z.infer<typeof ClipboardItemSchema>
export type TransferState = z.infer<typeof TransferStateSchema>
export type Transfer = z.infer<typeof TransferSchema>
export type Overview = z.infer<typeof OverviewSchema>
export type Publication = z.infer<typeof PublicationSchema>
export type Page<Value> = { readonly items: readonly Value[]; readonly cursor: string; readonly hasMore: boolean }
