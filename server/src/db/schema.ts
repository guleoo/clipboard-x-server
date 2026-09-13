import { index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

export const metadata = sqliteTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const administrators = sqliteTable("administrators", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const adminSessions = sqliteTable("admin_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
}, (table) => [index("admin_sessions_expiry").on(table.expiresAt)])

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  tag: text("tag").notNull(),
  iconKind: text("icon_kind").notNull(),
  state: text("state").notNull().default("offline"),
  lastSeenAt: integer("last_seen_at").notNull().default(0),
  disabledAt: integer("disabled_at"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const deviceKeys = sqliteTable("device_keys", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  secretHash: text("secret_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
}, (table) => [index("device_keys_device").on(table.deviceId, table.revokedAt, table.expiresAt)])

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
})

export const channelMembers = sqliteTable("channel_members", {
  channelId: text("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  joinedAt: integer("joined_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.channelId, table.deviceId] }),
  index("channel_members_device").on(table.deviceId, table.channelId),
])

export const objects = sqliteTable("objects", {
  id: text("id").primaryKey(),
  sha256: text("sha256").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  refCount: integer("ref_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  unique("objects_sha256_size").on(table.sha256, table.size),
  index("objects_collectable").on(table.refCount, table.createdAt),
])

export const clipboardItems = sqliteTable("clipboard_items", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  originDeviceId: text("origin_device_id").notNull().references(() => devices.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("clipboard_items_page").on(table.channelId, table.visible, table.deletedAt, table.createdAt, table.id),
  index("clipboard_items_origin").on(table.originDeviceId, table.createdAt),
])

export const representations = sqliteTable("representations", {
  itemId: text("item_id").notNull().references(() => clipboardItems.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  delivery: text("delivery").notNull(),
  availability: text("availability").notNull(),
  objectId: text("object_id").references(() => objects.id),
}, (table) => [primaryKey({ columns: [table.itemId, table.id] })])

export const previews = sqliteTable("previews", {
  itemId: text("item_id").notNull().references(() => clipboardItems.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  contentId: text("content_id").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  truncated: integer("truncated", { mode: "boolean" }).notNull(),
  objectId: text("object_id").references(() => objects.id),
}, (table) => [primaryKey({ columns: [table.itemId, table.id] })])

export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id),
  itemId: text("item_id").notNull(),
  kind: text("kind").notNull(),
  direction: text("direction").notNull(),
  state: text("state").notNull(),
  completedBytes: integer("completed_bytes").notNull(),
  totalBytes: integer("total_bytes").notNull(),
  peerDeviceIds: text("peer_device_ids", { mode: "json" }).$type<readonly string[]>().notNull().default([]),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at"),
}, (table) => [
  index("transfers_device").on(table.deviceId, table.updatedAt),
  index("transfers_state").on(table.state, table.expiresAt),
])

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  channelId: text("channel_id").notNull(),
  deviceId: text("device_id").notNull(),
  transferId: text("transfer_id").notNull().references(() => transfers.id),
  kind: text("kind").notNull(),
  state: text("state").notNull(),
  workId: text("work_id"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
})

export const uploadObjects = sqliteTable("upload_objects", {
  uploadId: text("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  objectKind: text("object_kind").notNull(),
  objectId: text("object_id").notNull(),
  expectedSize: integer("expected_size").notNull(),
  expectedSha256: text("expected_sha256").notNull(),
  mimeType: text("mime_type").notNull(),
  storedObjectId: text("stored_object_id").references(() => objects.id),
  uploadedAt: integer("uploaded_at"),
}, (table) => [primaryKey({ columns: [table.uploadId, table.objectKind, table.objectId] })])

export const changes = sqliteTable("changes", {
  sequence: integer("sequence").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("changes_channel").on(table.channelId, table.sequence)])

export const materializationRequests = sqliteTable("materialization_requests", {
  id: text("id").primaryKey(),
  activeKey: text("active_key").unique(),
  channelId: text("channel_id").notNull(),
  itemId: text("item_id").notNull(),
  contentId: text("content_id").notNull(),
  sourceDeviceId: text("source_device_id").notNull(),
  state: text("state").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
})

export const materializationWaiters = sqliteTable("materialization_waiters", {
  requestId: text("request_id").notNull().references(() => materializationRequests.id, { onDelete: "cascade" }),
  transferId: text("transfer_id").notNull().references(() => transfers.id, { onDelete: "cascade" }),
  requesterKind: text("requester_kind").notNull(),
  requesterId: text("requester_id").notNull(),
}, (table) => [primaryKey({ columns: [table.requestId, table.transferId] })])

export const workQueue = sqliteTable("work_queue", {
  sequence: integer("sequence").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  sourceDeviceId: text("source_device_id").notNull(),
  requestId: text("request_id").notNull().references(() => materializationRequests.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  contentId: text("content_id").notNull(),
  state: text("state").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("work_device").on(table.sourceDeviceId, table.sequence)])
