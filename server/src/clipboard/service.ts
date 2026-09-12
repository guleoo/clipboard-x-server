import type { Database } from "bun:sqlite"
import { ChannelsService } from "../channels/service"
import { Cursor } from "../common/cursor"
import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"
import type { ServerConfig } from "../entry/config"
import type { ObjectStore, StoredObject } from "../infrastructure/objects/store"
import { TransfersService, type Transfer } from "../transfers/service"

export interface RepresentationManifest {
  readonly id: string
  readonly mimeType: string
  readonly size: number
  readonly sha256: string
  readonly delivery: "eager" | "on-demand"
}

export interface PreviewManifest {
  readonly id: string
  readonly contentId: string
  readonly mimeType: string
  readonly size: number
  readonly sha256: string
  readonly truncated: boolean
}

export interface ItemManifest {
  readonly id: string
  readonly createdAt: number
  readonly originDeviceId: string
  readonly contents: readonly RepresentationManifest[]
  readonly previews: readonly PreviewManifest[]
}

interface ItemRow {
  readonly id: string
  readonly channel_id: string
  readonly origin_device_id: string
  readonly created_at: number
  readonly updated_at: number
  readonly deleted_at: number | null
  readonly visible: number
  readonly tag: string
  readonly icon_kind: string
  readonly channel_name: string
}

interface RepresentationRow {
  readonly item_id: string
  readonly id: string
  readonly mime_type: string
  readonly size: number
  readonly sha256: string
  readonly delivery: "eager" | "on-demand"
  readonly availability: "available" | "source-required" | "requesting" | "expired" | "failed"
  readonly object_id: string | null
}

interface PreviewRow {
  readonly item_id: string
  readonly id: string
  readonly content_id: string
  readonly mime_type: string
  readonly size: number
  readonly sha256: string
  readonly truncated: number
  readonly object_id: string | null
}

interface UploadRow {
  readonly id: string
  readonly item_id: string
  readonly channel_id: string
  readonly device_id: string
  readonly transfer_id: string
  readonly kind: "publish" | "materialize"
  readonly state: string
  readonly work_id: string | null
  readonly created_at: number
  readonly expires_at: number
}

interface UploadObjectRow {
  readonly upload_id: string
  readonly object_kind: "preview" | "content"
  readonly object_id: string
  readonly expected_size: number
  readonly expected_sha256: string
  readonly mime_type: string
  readonly stored_object_id: string | null
  readonly uploaded_at: number | null
}

interface ObjectRow {
  readonly id: string
  readonly sha256: string
  readonly size: number
  readonly path: string
  readonly ref_count: number
  readonly created_at: number
}

interface WorkRow {
  readonly sequence: number
  readonly id: string
  readonly source_device_id: string
  readonly request_id: string
  readonly item_id: string
  readonly content_id: string
  readonly state: string
  readonly created_at: number
  readonly updated_at: number
}

export interface ClipboardItem {
  readonly id: string
  readonly channelId: string
  readonly channelName: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly origin: { readonly deviceId: string; readonly tag: string; readonly iconKind: string }
  readonly contents: readonly (RepresentationManifest & { readonly availability: string })[]
  readonly previews: readonly PreviewManifest[]
}

export interface Publication {
  readonly itemId: string
  readonly uploadId: string
  readonly previewIds: readonly string[]
  readonly contentIds: readonly string[]
  readonly transfer: Transfer
}

export interface BinaryObject {
  readonly path: string
  readonly mimeType: string
  readonly size: number
  readonly sha256: string
}

interface ListCursor {
  readonly createdAt: number
  readonly id: string
}

function listCursor(item: Pick<ItemRow, "created_at" | "id">): string {
  return Buffer.from(JSON.stringify({ version: 1, createdAt: item.created_at, id: item.id })).toString("base64url")
}

function readListCursor(value: string | undefined): ListCursor | undefined {
  if (!value) return undefined
  if (value.length > 512) throw new DomainError("invalid_request", "Pagination cursor is too long", 400)
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      version?: unknown
      createdAt?: unknown
      id?: unknown
    }
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.createdAt) || Number(parsed.createdAt) < 0
      || typeof parsed.id !== "string" || parsed.id.length > 128) throw new Error()
    return { createdAt: Number(parsed.createdAt), id: parsed.id }
  } catch (cause) {
    throw new DomainError("invalid_request", "Pagination cursor is invalid", 400, undefined, { cause })
  }
}

export class ClipboardService {
  constructor(
    private readonly database: Database,
    private readonly objects: ObjectStore,
    private readonly channels: ChannelsService,
    private readonly transfers: TransfersService,
    private readonly config: ServerConfig,
  ) {}

  status(): Readonly<Record<string, unknown>> {
    const pendingItems = Number(this.database.query<{ count: number }, []>(
      "SELECT count(*) AS count FROM clipboard_items WHERE visible = 0 AND deleted_at IS NULL",
    ).get()?.count ?? 0)
    const activeTransfers = Number(this.database.query<{ count: number }, []>(
      `SELECT count(*) AS count FROM transfers
       WHERE state NOT IN ('completed', 'failed', 'cancelled', 'expired')`,
    ).get()?.count ?? 0)
    const activity = this.database.query<{ last_sync_at: number; revision: number }, []>(
      "SELECT COALESCE(max(created_at), 0) AS last_sync_at, COALESCE(max(sequence), 0) AS revision FROM changes",
    ).get()
    return {
      apiVersion: 1,
      serverVersion: "0.1.0",
      state: "online",
      capabilities: {
        supportedMimeTypes: this.config.supportedMimeTypes,
        maxItemBytes: this.config.maxItemBytes,
        maxPreviewBytes: this.config.maxPreviewBytes,
      },
      pendingItems,
      activeTransfers,
      lastSyncAt: activity?.last_sync_at ?? 0,
      revision: Math.max(1, activity?.revision ?? 0),
    }
  }

  createPublication(deviceId: string, channelId: string, manifest: ItemManifest): Publication {
    this.channels.requireMember(channelId, deviceId)
    if (manifest.originDeviceId !== deviceId) {
      throw new DomainError("device_mismatch", "Item origin does not match the authenticated device", 403)
    }
    const totalDeclared = manifest.contents.reduce((sum, value) => sum + value.size, 0)
    if (totalDeclared > this.config.maxItemBytes) {
      throw new DomainError("too_large", "Item exceeds the configured byte limit", 413)
    }
    if (manifest.contents.some((value) => value.size > this.config.maxObjectBytes)) {
      throw new DomainError("too_large", "A content representation exceeds the configured object limit", 413)
    }
    if (manifest.previews.some((value) => value.size > this.config.maxPreviewBytes)) {
      throw new DomainError("too_large", "A preview exceeds the configured preview limit", 413)
    }
    const existing = this.itemRow(manifest.id, false)
    if (existing) {
      if (existing.channel_id !== channelId || existing.origin_device_id !== deviceId || !this.manifestMatches(manifest)) {
        throw new DomainError("item_conflict", "ItemId already exists with a different manifest", 409)
      }
      const previous = this.database.query<UploadRow, [string]>(
        "SELECT * FROM uploads WHERE item_id = ? AND kind = 'publish' ORDER BY created_at DESC LIMIT 1",
      ).get(manifest.id)
      if (previous) {
        const transfer = this.transfers.get(previous.transfer_id)
        if (!new Set(["failed", "cancelled", "expired"]).has(transfer.state)) return this.publication(previous)
      }
      return this.createUploadForExisting(deviceId, channelId, manifest.id)
    }

    const now = Date.now()
    this.database.transaction(() => {
      this.database.query(
        `INSERT INTO clipboard_items(id, channel_id, origin_device_id, created_at, updated_at, visible)
         VALUES (?, ?, ?, ?, ?, 0)`,
      ).run(manifest.id, channelId, deviceId, manifest.createdAt, now)
      const representation = this.database.query(
        `INSERT INTO representations(
          item_id, id, mime_type, size, sha256, delivery, availability
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const content of manifest.contents) {
        representation.run(
          manifest.id,
          content.id,
          content.mimeType,
          content.size,
          content.sha256,
          content.delivery,
          content.delivery === "eager" ? "failed" : "source-required",
        )
      }
      const preview = this.database.query(
        `INSERT INTO previews(item_id, id, content_id, mime_type, size, sha256, truncated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const value of manifest.previews) {
        preview.run(
          manifest.id,
          value.id,
          value.contentId,
          value.mimeType,
          value.size,
          value.sha256,
          value.truncated ? 1 : 0,
        )
      }
    })()
    return this.createUploadForExisting(deviceId, channelId, manifest.id)
  }

  uploadExpectation(
    uploadId: string,
    objectKind: "preview" | "content",
    objectId: string,
    deviceId: string,
  ): UploadObjectRow & { readonly transferId: string; readonly baseBytes: number } {
    const upload = this.database.query<UploadRow, [string]>("SELECT * FROM uploads WHERE id = ?").get(uploadId)
    if (!upload || upload.device_id !== deviceId) throw notFound("Upload session not found")
    if (upload.state === "completed") throw new DomainError("invalid_request", "Upload is already complete", 409)
    if (upload.expires_at <= Date.now()) {
      this.transfers.update(upload.transfer_id, "expired", this.transfers.get(upload.transfer_id).completedBytes, {
        code: "transfer_expired",
        message: "Upload session expired",
      })
      throw new DomainError("transfer_expired", "Upload session expired", 410)
    }
    const object = this.database.query<UploadObjectRow, [string, string, string]>(
      "SELECT * FROM upload_objects WHERE upload_id = ? AND object_kind = ? AND object_id = ?",
    ).get(uploadId, objectKind, objectId)
    if (!object) throw notFound("Upload object not found")
    const baseBytes = this.database.query<{ total: number }, [string, string, string]>(
      `SELECT COALESCE(sum(expected_size), 0) AS total FROM upload_objects
       WHERE upload_id = ? AND uploaded_at IS NOT NULL
         AND NOT (object_kind = ? AND object_id = ?)`,
    ).get(uploadId, objectKind, objectId)?.total ?? 0
    return { ...object, transferId: upload.transfer_id, baseBytes }
  }

  progressUpload(expectation: { readonly transferId: string; readonly baseBytes: number }, objectBytes: number): void {
    const current = this.transfers.get(expectation.transferId)
    if (["completed", "failed", "cancelled", "expired"].includes(current.state)) return
    const completed = Math.min(current.totalBytes, expectation.baseBytes + objectBytes)
    if (completed >= current.completedBytes) {
      this.transfers.update(current.id, "transferring", completed)
      this.progressMaterializationWaiters(current.id, completed)
    }
  }

  recordUploadedObject(
    expectation: UploadObjectRow & { readonly transferId: string; readonly baseBytes: number },
    stored: StoredObject,
  ): void {
    const now = Date.now()
    this.database.transaction(() => {
      this.database.query(
        `INSERT INTO objects(id, sha256, size, path, ref_count, created_at)
         VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(sha256, size) DO NOTHING`,
      ).run(createId(), stored.sha256, stored.size, stored.path, now)
      const object = this.database.query<ObjectRow, [string, number]>(
        "SELECT * FROM objects WHERE sha256 = ? AND size = ?",
      ).get(stored.sha256, stored.size)
      if (!object) throw new Error("Stored object metadata could not be resolved")
      this.database.query(
        `UPDATE upload_objects SET stored_object_id = ?, uploaded_at = COALESCE(uploaded_at, ?)
         WHERE upload_id = ? AND object_kind = ? AND object_id = ?`,
      ).run(object.id, now, expectation.upload_id, expectation.object_kind, expectation.object_id)
      const completed = this.database.query<{ total: number }, [string]>(
        "SELECT COALESCE(sum(expected_size), 0) AS total FROM upload_objects WHERE upload_id = ? AND uploaded_at IS NOT NULL",
      ).get(expectation.upload_id)?.total ?? 0
      const current = this.transfers.get(expectation.transferId)
      if (completed >= current.completedBytes) {
        this.transfers.update(expectation.transferId, "transferring", Math.min(completed, current.totalBytes))
        this.progressMaterializationWaiters(expectation.transferId, Math.min(completed, current.totalBytes))
      }
    })()
  }

  completeUpload(uploadId: string, deviceId: string): { readonly transfer: Transfer } {
    const upload = this.database.query<UploadRow, [string]>("SELECT * FROM uploads WHERE id = ?").get(uploadId)
    if (!upload || upload.device_id !== deviceId) throw notFound("Upload session not found")
    if (upload.state === "completed") return { transfer: this.transfers.get(upload.transfer_id, deviceId) }
    const missing = this.database.query<{ count: number }, [string]>(
      "SELECT count(*) AS count FROM upload_objects WHERE upload_id = ? AND stored_object_id IS NULL",
    ).get(uploadId)?.count ?? 0
    if (missing > 0) throw new DomainError("invalid_request", "Upload session still has missing objects", 409)

    const current = this.transfers.get(upload.transfer_id, deviceId)
    this.transfers.update(upload.transfer_id, "verifying", current.totalBytes)
    this.database.transaction(() => {
      const uploaded = this.database.query<UploadObjectRow, [string]>(
        "SELECT * FROM upload_objects WHERE upload_id = ?",
      ).all(uploadId)
      if (upload.kind === "publish") this.completePublication(upload, uploaded)
      else this.completeMaterialization(upload, uploaded)
      this.database.query("UPDATE uploads SET state = 'completed' WHERE id = ?").run(upload.id)
      this.transfers.update(upload.transfer_id, "completed", current.totalBytes)
    })()
    return { transfer: this.transfers.get(upload.transfer_id, deviceId) }
  }

  changes(deviceId: string, channelId: string, cursor: string | undefined, limit: number) {
    this.channels.requireMember(channelId, deviceId)
    const sequence = Cursor.decode(cursor)
    const rows = this.database.query<{
      sequence: number
      kind: "upsert" | "remove"
      item_id: string
      reason: string
    }, [string, number, number]>(
      `SELECT sequence, kind, item_id, reason FROM changes
       WHERE channel_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`,
    ).all(channelId, sequence, limit + 1)
    const page = rows.slice(0, limit)
    const last = page.at(-1)?.sequence ?? sequence
    return {
      cursor: Cursor.encode(last),
      hasMore: rows.length > limit,
      changes: page.map((row) => ({
        sequence: row.sequence,
        kind: row.kind,
        itemId: row.item_id,
        reason: row.reason,
      })),
    }
  }

  item(deviceId: string, channelId: string, itemId: string): ClipboardItem {
    this.channels.requireMember(channelId, deviceId)
    const row = this.itemRow(itemId)
    if (!row || row.channel_id !== channelId) throw notFound("Clipboard item not found")
    return this.itemOf(row)
  }

  adminItem(itemId: string): ClipboardItem {
    const row = this.itemRow(itemId)
    if (!row) throw notFound("Clipboard item not found")
    return this.itemOf(row)
  }

  adminPreview(itemId: string, previewId: string): BinaryObject {
    const item = this.adminItem(itemId)
    return this.preview(undefined, item.channelId, itemId, previewId)
  }

  adminContent(itemId: string, contentId: string): BinaryObject {
    const item = this.adminItem(itemId)
    return this.content(undefined, item.channelId, itemId, contentId)
  }

  list(input: {
    readonly channelId?: string | undefined
    readonly deviceId?: string | undefined
    readonly mimeType?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit: number
    readonly memberDeviceId?: string | undefined
  }) {
    if (input.memberDeviceId && !input.channelId) {
      throw new DomainError("invalid_request", "Device item listing requires a channel", 400)
    }
    if (input.memberDeviceId && input.channelId) this.channels.requireMember(input.channelId, input.memberDeviceId)
    const cursor = readListCursor(input.cursor)
    const conditions = ["i.visible = 1", "i.deleted_at IS NULL", "c.deleted_at IS NULL"]
    const parameters: Array<string | number> = []
    if (input.channelId) {
      conditions.push("i.channel_id = ?")
      parameters.push(input.channelId)
    }
    if (input.deviceId) {
      conditions.push("i.origin_device_id = ?")
      parameters.push(input.deviceId)
    }
    if (input.mimeType) {
      conditions.push("EXISTS (SELECT 1 FROM representations rf WHERE rf.item_id = i.id AND rf.mime_type LIKE ?)")
      parameters.push(input.mimeType.endsWith("/") ? `${input.mimeType}%` : input.mimeType)
    }
    if (input.query) {
      conditions.push("(d.tag LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')")
      const escaped = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`
      parameters.push(escaped, escaped)
    }
    if (cursor) {
      conditions.push("(i.created_at < ? OR (i.created_at = ? AND i.id < ?))")
      parameters.push(cursor.createdAt, cursor.createdAt, cursor.id)
    }
    const sql = `SELECT i.*, d.tag, d.icon_kind, c.name AS channel_name
      FROM clipboard_items i
      JOIN devices d ON d.id = i.origin_device_id
      JOIN channels c ON c.id = i.channel_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY i.created_at DESC, i.id DESC LIMIT ?`
    const rows = this.database.query<ItemRow, Array<string | number>>(sql).all(
      ...parameters,
      input.limit + 1,
    )
    const page = rows.slice(0, input.limit).map((row) => this.itemOf(row))
    return {
      items: page,
      cursor: rows.length > input.limit && page.length > 0 ? listCursor(rows[input.limit - 1]!) : "",
      hasMore: rows.length > input.limit,
    }
  }

  preview(deviceId: string | undefined, channelId: string, itemId: string, previewId: string): BinaryObject {
    if (deviceId) this.channels.requireMember(channelId, deviceId)
    const row = this.database.query<PreviewRow & Pick<ObjectRow, "path">, [string, string, string]>(
      `SELECT p.*, o.path FROM previews p
       JOIN clipboard_items i ON i.id = p.item_id
       JOIN objects o ON o.id = p.object_id
       WHERE p.item_id = ? AND p.id = ? AND i.channel_id = ? AND i.visible = 1 AND i.deleted_at IS NULL`,
    ).get(itemId, previewId, channelId)
    if (!row) throw notFound("Preview not found")
    return { path: row.path, mimeType: row.mime_type, size: row.size, sha256: row.sha256 }
  }

  content(deviceId: string | undefined, channelId: string, itemId: string, contentId: string): BinaryObject {
    if (deviceId) this.channels.requireMember(channelId, deviceId)
    const row = this.database.query<RepresentationRow & Pick<ObjectRow, "path">, [string, string, string]>(
      `SELECT r.*, o.path FROM representations r
       JOIN clipboard_items i ON i.id = r.item_id
       LEFT JOIN objects o ON o.id = r.object_id
       WHERE r.item_id = ? AND r.id = ? AND i.channel_id = ? AND i.visible = 1 AND i.deleted_at IS NULL`,
    ).get(itemId, contentId, channelId)
    if (!row) throw notFound("Content not found")
    if (row.availability !== "available" || !row.path) {
      throw new DomainError("content_not_ready", "Content is not available yet", 409, { availability: row.availability })
    }
    return { path: row.path, mimeType: row.mime_type, size: row.size, sha256: row.sha256 }
  }

  requestContent(input: {
    readonly requesterKind: "device" | "admin"
    readonly requesterId: string
    readonly memberDeviceId?: string
    readonly channelId: string
    readonly itemId: string
    readonly contentId: string
  }): { readonly transfer: Transfer } {
    this.expireMaterializations()
    if (input.memberDeviceId) this.channels.requireMember(input.channelId, input.memberDeviceId)
    const row = this.database.query<RepresentationRow & { channel_id: string; origin_device_id: string }, [string, string]>(
      `SELECT r.*, i.channel_id, i.origin_device_id FROM representations r
       JOIN clipboard_items i ON i.id = r.item_id
       WHERE r.item_id = ? AND r.id = ? AND i.visible = 1 AND i.deleted_at IS NULL`,
    ).get(input.itemId, input.contentId)
    if (!row || row.channel_id !== input.channelId) throw notFound("Content not found")
    const transferDeviceId = input.requesterKind === "device" ? input.requesterId : row.origin_device_id
    if (row.availability === "available") {
      const created = this.transfers.create({
        deviceId: transferDeviceId,
        itemId: input.itemId,
        kind: "content",
        direction: "download",
        state: "queued",
        totalBytes: row.size,
        peerDeviceIds: [row.origin_device_id],
      })
      return { transfer: this.transfers.update(created.id, "completed", row.size) }
    }

    const activeKey = `${input.itemId}:${input.contentId}`
    let request = this.database.query<{ id: string; expires_at: number }, [string]>(
      "SELECT id, expires_at FROM materialization_requests WHERE active_key = ?",
    ).get(activeKey)
    const now = Date.now()
    if (request && request.expires_at <= now) {
      this.failMaterialization(request.id, "transfer_expired", "Materialization request expired", "expired")
      request = null
    }
    if (request) {
      const existing = this.database.query<{ transfer_id: string }, [string, string, string]>(
        `SELECT transfer_id FROM materialization_waiters
         WHERE request_id = ? AND requester_kind = ? AND requester_id = ?`,
      ).get(request.id, input.requesterKind, input.requesterId)
      if (existing) return { transfer: this.transfers.get(existing.transfer_id) }
    }

    return this.database.transaction(() => {
      if (!request) {
        const requestId = createId()
        const expiresAt = now + this.config.materializationTtlMs
        this.database.query(
          `INSERT INTO materialization_requests(
            id, active_key, channel_id, item_id, content_id, source_device_id,
            state, created_at, updated_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'waiting-for-peer', ?, ?, ?)`,
        ).run(requestId, activeKey, input.channelId, input.itemId, input.contentId, row.origin_device_id, now, now, expiresAt)
        this.database.query(
          `INSERT INTO work_queue(
            id, source_device_id, request_id, item_id, content_id, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
        ).run(createId(), row.origin_device_id, requestId, input.itemId, input.contentId, now, now)
        this.database.query(
          "UPDATE representations SET availability = 'requesting' WHERE item_id = ? AND id = ?",
        ).run(input.itemId, input.contentId)
        request = { id: requestId, expires_at: expiresAt }
      }
      const transfer = this.transfers.create({
        deviceId: transferDeviceId,
        itemId: input.itemId,
        kind: "content",
        direction: "download",
        state: "waiting-for-peer",
        totalBytes: row.size,
        peerDeviceIds: [row.origin_device_id],
        expiresAt: request.expires_at,
      })
      this.database.query(
        `INSERT INTO materialization_waiters(request_id, transfer_id, requester_kind, requester_id)
         VALUES (?, ?, ?, ?)`,
      ).run(request.id, transfer.id, input.requesterKind, input.requesterId)
      return { transfer }
    })()
  }

  work(deviceId: string, cursor: string | undefined, limit: number) {
    this.expireMaterializations()
    const sequence = Cursor.decode(cursor)
    const rows = this.database.query<WorkRow, [string, number, number]>(
      `SELECT * FROM work_queue WHERE source_device_id = ? AND sequence > ?
       ORDER BY sequence LIMIT ?`,
    ).all(deviceId, sequence, limit + 1)
    const page = rows.slice(0, limit)
    return {
      cursor: Cursor.encode(page.at(-1)?.sequence ?? sequence),
      hasMore: rows.length > limit,
      work: page.filter((row) => row.state === "queued").map((row) => ({
        id: row.id,
        type: "materialize-content" as const,
        itemId: row.item_id,
        contentId: row.content_id,
      })),
    }
  }

  acceptWork(deviceId: string, workId: string): { readonly uploadId: string; readonly transfer: Transfer } {
    const work = this.database.query<WorkRow, [string]>("SELECT * FROM work_queue WHERE id = ?").get(workId)
    if (!work || work.source_device_id !== deviceId) throw notFound("Work item not found")
    const previous = this.database.query<UploadRow, [string]>("SELECT * FROM uploads WHERE work_id = ?").get(workId)
    if (previous) return { uploadId: previous.id, transfer: this.transfers.get(previous.transfer_id, deviceId) }
    if (work.state !== "queued") throw new DomainError("invalid_request", "Work item is not available", 409)
    const representation = this.database.query<RepresentationRow, [string, string]>(
      "SELECT * FROM representations WHERE item_id = ? AND id = ?",
    ).get(work.item_id, work.content_id)
    if (!representation) throw notFound("Content not found")
    const now = Date.now()
    return this.database.transaction(() => {
      const transfer = this.transfers.create({
        deviceId,
        itemId: work.item_id,
        kind: "content",
        direction: "upload",
        state: "queued",
        totalBytes: representation.size,
        expiresAt: now + this.config.materializationTtlMs,
      })
      const uploadId = createId()
      this.database.query(
        `INSERT INTO uploads(
          id, item_id, channel_id, device_id, transfer_id, kind, state, work_id, created_at, expires_at
        ) SELECT ?, m.item_id, m.channel_id, ?, ?, 'materialize', 'open', ?, ?, m.expires_at
          FROM materialization_requests m WHERE m.id = ?`,
      ).run(uploadId, deviceId, transfer.id, workId, now, work.request_id)
      this.database.query(
        `INSERT INTO upload_objects(
          upload_id, object_kind, object_id, expected_size, expected_sha256, mime_type
        ) VALUES (?, 'content', ?, ?, ?, ?)`,
      ).run(uploadId, representation.id, representation.size, representation.sha256, representation.mime_type)
      this.database.query("UPDATE work_queue SET state = 'accepted', updated_at = ? WHERE id = ?").run(now, workId)
      this.database.query(
        "UPDATE materialization_requests SET state = 'transferring', updated_at = ? WHERE id = ?",
      ).run(now, work.request_id)
      return { uploadId, transfer }
    })()
  }

  rejectWork(deviceId: string, workId: string, code: string, message: string): void {
    const work = this.database.query<WorkRow, [string]>("SELECT * FROM work_queue WHERE id = ?").get(workId)
    if (!work || work.source_device_id !== deviceId) throw notFound("Work item not found")
    if (work.state === "rejected") return
    const state = code === "source_content_missing" ? "expired" : "failed"
    this.database.query("UPDATE work_queue SET state = 'rejected', updated_at = ? WHERE id = ?")
      .run(Date.now(), workId)
    this.failMaterialization(work.request_id, code, message || code, state)
  }

  deleteItem(itemId: string, channelId?: string, memberDeviceId?: string): void {
    const row = this.itemRow(itemId)
    if (!row || (channelId && row.channel_id !== channelId)) throw notFound("Clipboard item not found")
    if (memberDeviceId) this.channels.requireMember(row.channel_id, memberDeviceId)
    if (row.deleted_at) return
    const now = Date.now()
    this.database.transaction(() => {
      const references = this.database.query<{ object_id: string }, [string, string]>(
        `SELECT object_id FROM representations WHERE item_id = ? AND object_id IS NOT NULL
         UNION ALL SELECT object_id FROM previews WHERE item_id = ? AND object_id IS NOT NULL`,
      ).all(itemId, itemId)
      for (const reference of references) {
        this.database.query("UPDATE objects SET ref_count = max(0, ref_count - 1) WHERE id = ?")
          .run(reference.object_id)
      }
      this.database.query("UPDATE clipboard_items SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, itemId)
      this.database.query(
        "INSERT INTO changes(channel_id, kind, item_id, reason, created_at) VALUES (?, 'remove', ?, 'deleted', ?)",
      ).run(row.channel_id, itemId, now)
    })()
  }

  private createUploadForExisting(deviceId: string, channelId: string, itemId: string): Publication {
    const objects = [
      ...this.database.query<PreviewRow, [string]>("SELECT * FROM previews WHERE item_id = ?").all(itemId)
        .map((row) => ({ kind: "preview" as const, id: row.id, size: row.size, sha256: row.sha256, mime: row.mime_type })),
      ...this.database.query<RepresentationRow, [string]>(
        "SELECT * FROM representations WHERE item_id = ? AND delivery = 'eager'",
      ).all(itemId).map((row) => ({
        kind: "content" as const,
        id: row.id,
        size: row.size,
        sha256: row.sha256,
        mime: row.mime_type,
      })),
    ]
    const totalBytes = objects.reduce((sum, object) => sum + object.size, 0)
    const transfer = this.transfers.create({
      deviceId,
      itemId,
      kind: "publish",
      direction: "upload",
      state: "queued",
      totalBytes,
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    const uploadId = createId()
    const now = Date.now()
    this.database.transaction(() => {
      this.database.query(
        `INSERT INTO uploads(
          id, item_id, channel_id, device_id, transfer_id, kind, state, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, 'publish', 'open', ?, ?)`,
      ).run(uploadId, itemId, channelId, deviceId, transfer.id, now, now + 60 * 60 * 1000)
      const insert = this.database.query(
        `INSERT INTO upload_objects(
          upload_id, object_kind, object_id, expected_size, expected_sha256, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const object of objects) insert.run(uploadId, object.kind, object.id, object.size, object.sha256, object.mime)
    })()
    if (objects.length === 0) this.completeUpload(uploadId, deviceId)
    return this.publication(this.database.query<UploadRow, [string]>("SELECT * FROM uploads WHERE id = ?").get(uploadId)!)
  }

  private progressMaterializationWaiters(uploadTransferId: string, completedBytes: number): void {
    const upload = this.database.query<{ work_id: string | null }, [string]>(
      "SELECT work_id FROM uploads WHERE transfer_id = ? AND kind = 'materialize'",
    ).get(uploadTransferId)
    if (!upload?.work_id) return
    const request = this.database.query<{ request_id: string }, [string]>(
      "SELECT request_id FROM work_queue WHERE id = ?",
    ).get(upload.work_id)
    if (!request) return
    const waiters = this.database.query<{ transfer_id: string }, [string]>(
      "SELECT transfer_id FROM materialization_waiters WHERE request_id = ?",
    ).all(request.request_id)
    for (const waiter of waiters) {
      const transfer = this.transfers.get(waiter.transfer_id)
      if (!["completed", "failed", "cancelled", "expired"].includes(transfer.state)) {
        this.transfers.update(waiter.transfer_id, "transferring", Math.min(completedBytes, transfer.totalBytes))
      }
    }
  }

  private expireMaterializations(): void {
    const expired = this.database.query<{ id: string }, [number]>(
      "SELECT id FROM materialization_requests WHERE active_key IS NOT NULL AND expires_at <= ?",
    ).all(Date.now())
    for (const request of expired) {
      this.failMaterialization(request.id, "transfer_expired", "Materialization request expired", "expired")
    }
  }

  private publication(upload: UploadRow): Publication {
    const objects = this.database.query<UploadObjectRow, [string]>(
      "SELECT * FROM upload_objects WHERE upload_id = ? ORDER BY object_kind DESC, object_id",
    ).all(upload.id)
    return {
      itemId: upload.item_id,
      uploadId: upload.id,
      previewIds: objects.filter((object) => object.object_kind === "preview").map((object) => object.object_id),
      contentIds: objects.filter((object) => object.object_kind === "content").map((object) => object.object_id),
      transfer: this.transfers.get(upload.transfer_id),
    }
  }

  private completePublication(upload: UploadRow, objects: readonly UploadObjectRow[]): void {
    for (const object of objects) {
      if (!object.stored_object_id) throw new Error("Upload object is missing")
      if (object.object_kind === "preview") {
        this.database.query("UPDATE previews SET object_id = ? WHERE item_id = ? AND id = ?")
          .run(object.stored_object_id, upload.item_id, object.object_id)
      } else {
        this.database.query(
          "UPDATE representations SET object_id = ?, availability = 'available' WHERE item_id = ? AND id = ?",
        ).run(object.stored_object_id, upload.item_id, object.object_id)
      }
      this.database.query("UPDATE objects SET ref_count = ref_count + 1 WHERE id = ?").run(object.stored_object_id)
    }
    const item = this.itemRow(upload.item_id, false)
    if (!item) throw new Error("Publication item is missing")
    if (!item.visible) {
      const now = Date.now()
      this.database.query("UPDATE clipboard_items SET visible = 1, updated_at = ? WHERE id = ?")
        .run(now, upload.item_id)
      this.database.query(
        "INSERT INTO changes(channel_id, kind, item_id, created_at) VALUES (?, 'upsert', ?, ?)",
      ).run(upload.channel_id, upload.item_id, now)
    }
  }

  private completeMaterialization(upload: UploadRow, objects: readonly UploadObjectRow[]): void {
    const object = objects[0]
    if (!object?.stored_object_id || !upload.work_id) throw new Error("Materialization upload is incomplete")
    this.database.query(
      "UPDATE representations SET object_id = ?, availability = 'available' WHERE item_id = ? AND id = ?",
    ).run(object.stored_object_id, upload.item_id, object.object_id)
    this.database.query("UPDATE objects SET ref_count = ref_count + 1 WHERE id = ?").run(object.stored_object_id)
    const work = this.database.query<WorkRow, [string]>("SELECT * FROM work_queue WHERE id = ?").get(upload.work_id)
    if (!work) throw new Error("Materialization work is missing")
    const now = Date.now()
    this.database.query("UPDATE work_queue SET state = 'completed', updated_at = ? WHERE id = ?")
      .run(now, work.id)
    this.database.query(
      "UPDATE materialization_requests SET active_key = NULL, state = 'completed', updated_at = ? WHERE id = ?",
    ).run(now, work.request_id)
    const waiters = this.database.query<{ transfer_id: string }, [string]>(
      "SELECT transfer_id FROM materialization_waiters WHERE request_id = ?",
    ).all(work.request_id)
    for (const waiter of waiters) {
      const transfer = this.transfers.get(waiter.transfer_id)
      this.transfers.update(waiter.transfer_id, "completed", transfer.totalBytes)
    }
  }

  private failMaterialization(
    requestId: string,
    code: string,
    message: string,
    state: "failed" | "expired",
  ): void {
    const request = this.database.query<{ item_id: string; content_id: string }, [string]>(
      "SELECT item_id, content_id FROM materialization_requests WHERE id = ?",
    ).get(requestId)
    if (!request) return
    const now = Date.now()
    this.database.transaction(() => {
      this.database.query(
        "UPDATE materialization_requests SET active_key = NULL, state = ?, updated_at = ? WHERE id = ?",
      ).run(state, now, requestId)
      this.database.query(
        "UPDATE work_queue SET state = ?, updated_at = ? WHERE request_id = ? AND state = 'queued'",
      ).run(state, now, requestId)
      this.database.query("UPDATE representations SET availability = ? WHERE item_id = ? AND id = ?")
        .run(state, request.item_id, request.content_id)
      const waiters = this.database.query<{ transfer_id: string }, [string]>(
        "SELECT transfer_id FROM materialization_waiters WHERE request_id = ?",
      ).all(requestId)
      for (const waiter of waiters) {
        const transfer = this.transfers.get(waiter.transfer_id)
        this.transfers.update(waiter.transfer_id, state, transfer.completedBytes, { code, message })
      }
    })()
  }

  private itemRow(itemId: string, visible = true): ItemRow | undefined {
    return this.database.query<ItemRow, [string]>(
      `SELECT i.*, d.tag, d.icon_kind, c.name AS channel_name
       FROM clipboard_items i JOIN devices d ON d.id = i.origin_device_id
       JOIN channels c ON c.id = i.channel_id
       WHERE i.id = ? ${visible ? "AND i.visible = 1 AND i.deleted_at IS NULL" : ""}`,
    ).get(itemId) ?? undefined
  }

  private itemOf(row: ItemRow): ClipboardItem {
    const contents = this.database.query<RepresentationRow, [string]>(
      "SELECT * FROM representations WHERE item_id = ? ORDER BY id",
    ).all(row.id).map((content) => ({
      id: content.id,
      mimeType: content.mime_type,
      size: content.size,
      sha256: content.sha256,
      delivery: content.delivery,
      availability: content.availability,
    }))
    const previews = this.database.query<PreviewRow, [string]>(
      "SELECT * FROM previews WHERE item_id = ? ORDER BY id",
    ).all(row.id).map((preview) => ({
      id: preview.id,
      contentId: preview.content_id,
      mimeType: preview.mime_type,
      size: preview.size,
      sha256: preview.sha256,
      truncated: Boolean(preview.truncated),
    }))
    return {
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      origin: { deviceId: row.origin_device_id, tag: row.tag, iconKind: row.icon_kind },
      contents,
      previews,
    }
  }

  private manifestMatches(manifest: ItemManifest): boolean {
    const contents = this.database.query<RepresentationRow, [string]>(
      "SELECT * FROM representations WHERE item_id = ? ORDER BY id",
    ).all(manifest.id)
    const previews = this.database.query<PreviewRow, [string]>(
      "SELECT * FROM previews WHERE item_id = ? ORDER BY id",
    ).all(manifest.id)
    const expectedContents = [...manifest.contents].sort((left, right) => left.id.localeCompare(right.id))
    const expectedPreviews = [...manifest.previews].sort((left, right) => left.id.localeCompare(right.id))
    return contents.length === expectedContents.length && previews.length === expectedPreviews.length
      && contents.every((row, index) => {
        const value = expectedContents[index]
        return value && row.id === value.id && row.mime_type === value.mimeType && row.size === value.size
          && row.sha256 === value.sha256 && row.delivery === value.delivery
      })
      && previews.every((row, index) => {
        const value = expectedPreviews[index]
        return value && row.id === value.id && row.content_id === value.contentId
          && row.mime_type === value.mimeType && row.size === value.size && row.sha256 === value.sha256
          && Boolean(row.truncated) === value.truncated
      })
  }
}
