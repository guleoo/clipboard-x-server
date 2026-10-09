import { Cursor } from "../common/cursor"
import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"
import { isVirtualDevice, virtualDevice } from "../common/virtual-device"
import { config } from "../config"
import { objectStore, type StoredObject } from "../repo/object"
import {
  ClipboardRepo,
  type ItemRow,
  type UploadObjectRow,
  type UploadRow,
} from "../repo/clipboard"
import { channelService } from "./channel"
import { transferService, type Transfer } from "./transfer"

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

export interface ClipboardItem {
  readonly id: string
  readonly channelId: string
  readonly channelName: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly origin: {
    readonly deviceId: string
    readonly tag: string
    readonly iconKind: string
    readonly iconColor: { readonly light: string; readonly dark?: string }
    readonly kind: "client" | "virtual"
  }
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
  private readonly repo = new ClipboardRepo()
  private readonly objects = objectStore
  private readonly channels = channelService
  private readonly transfers = transferService
  private readonly config = config

  status(): Readonly<Record<string, unknown>> {
    const metrics = this.repo.statusMetrics()
    return {
      apiVersion: 1,
      serverVersion: "1.0.2",
      state: "online",
      capabilities: {
        supportedMimeTypes: config.supportedMimeTypes,
        maxItemBytes: config.maxItemBytes,
        maxPreviewBytes: config.maxPreviewBytes,
      },
      pendingItems: metrics.pendingItems,
      activeTransfers: metrics.activeTransfers,
      lastSyncAt: metrics.lastSyncAt,
      revision: Math.max(1, metrics.revision),
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
      if (existing.deleted_at !== null) {
        throw new DomainError("item_conflict", "ItemId has been removed from the server", 409)
      }
      if (existing.channel_id !== channelId || existing.origin_device_id !== deviceId || !this.manifestMatches(manifest)) {
        throw new DomainError("item_conflict", "ItemId already exists with a different manifest", 409)
      }
      const previous = this.repo.latestPublicationUpload(manifest.id)
      if (previous) {
        const transfer = this.transfers.get(previous.transfer_id)
        if (!new Set(["failed", "cancelled", "expired"]).has(transfer.state)) return this.publication(previous)
      }
      return this.createUploadForExisting(deviceId, channelId, manifest.id)
    }

    const now = Date.now()
    this.repo.transaction(() => this.repo.insertManifest(deviceId, channelId, manifest, now))
    return this.createUploadForExisting(deviceId, channelId, manifest.id)
  }

  publishFromVirtualDevice(channelId: string, manifest: Omit<ItemManifest, "originDeviceId">): Publication {
    if (manifest.contents.some((content) => content.delivery !== "eager")) {
      throw new DomainError("invalid_request", "Virtual device publications must upload complete content", 400)
    }
    return this.createPublication(virtualDevice.id, channelId, { ...manifest, originDeviceId: virtualDevice.id })
  }

  uploadExpectation(
    uploadId: string,
    objectKind: "preview" | "content",
    objectId: string,
    deviceId: string,
  ): UploadObjectRow & { readonly transferId: string; readonly baseBytes: number } {
    const upload = this.repo.upload(uploadId)
    if (!upload || upload.device_id !== deviceId) throw notFound("Upload session not found")
    if (upload.state === "completed") throw new DomainError("invalid_request", "Upload is already complete", 409)
    if (upload.state !== "open") throw new DomainError("transfer_expired", "Upload session is no longer available", 410)
    if (upload.expires_at <= Date.now()) {
      this.transfers.update(upload.transfer_id, "expired", this.transfers.get(upload.transfer_id).completedBytes, {
        code: "transfer_expired",
        message: "Upload session expired",
      })
      throw new DomainError("transfer_expired", "Upload session expired", 410)
    }
    const object = this.repo.uploadObject(uploadId, objectKind, objectId)
    if (!object) throw notFound("Upload object not found")
    const baseBytes = this.repo.uploadedBytes(uploadId, { kind: objectKind, id: objectId })
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
    this.repo.transaction(() => {
      const object = this.repo.storeObject({ id: createId(), sha256: stored.sha256, size: stored.size, path: stored.path, now })
      this.repo.attachUploadObject(expectation.upload_id, expectation.object_kind, expectation.object_id, object.id, now)
      const completed = this.repo.uploadedBytes(expectation.upload_id)
      const current = this.transfers.get(expectation.transferId)
      if (completed >= current.completedBytes) {
        this.transfers.update(expectation.transferId, "transferring", Math.min(completed, current.totalBytes))
        this.progressMaterializationWaiters(expectation.transferId, Math.min(completed, current.totalBytes))
      }
    })
  }

  completeUpload(uploadId: string, deviceId: string): { readonly transfer: Transfer } {
    const upload = this.repo.upload(uploadId)
    if (!upload || upload.device_id !== deviceId) throw notFound("Upload session not found")
    if (upload.state === "completed") return { transfer: this.transfers.get(upload.transfer_id, deviceId) }
    if (upload.state !== "open") throw new DomainError("transfer_expired", "Upload session is no longer available", 410)
    const missing = this.repo.missingUploadObjectCount(uploadId)
    if (missing > 0) throw new DomainError("invalid_request", "Upload session still has missing objects", 409)

    const current = this.transfers.get(upload.transfer_id, deviceId)
    this.transfers.update(upload.transfer_id, "verifying", current.totalBytes)
    this.repo.transaction(() => {
      const uploaded = this.repo.uploadObjects(uploadId)
      if (upload.kind === "publish") this.completePublication(upload, uploaded)
      else this.completeMaterialization(upload, uploaded)
      this.repo.completeUpload(upload.id)
      this.transfers.update(upload.transfer_id, "completed", current.totalBytes)
    })
    return { transfer: this.transfers.get(upload.transfer_id, deviceId) }
  }

  changes(deviceId: string, channelId: string, cursor: string | undefined, limit: number) {
    this.channels.requireReceiver(channelId, deviceId)
    const sequence = Cursor.decode(cursor)
    const rows = this.repo.changes(channelId, sequence, limit + 1)
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
    this.channels.requireReceiver(channelId, deviceId)
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
    if (input.memberDeviceId && input.channelId) this.channels.requireReceiver(input.channelId, input.memberDeviceId)
    const cursor = readListCursor(input.cursor)
    const rows = this.repo.list({
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(cursor ? { cursor } : {}),
      limit: input.limit + 1,
    })
    const page = rows.slice(0, input.limit).map((row) => this.itemOf(row))
    return {
      items: page,
      cursor: rows.length > input.limit && page.length > 0 ? listCursor(rows[input.limit - 1]!) : "",
      hasMore: rows.length > input.limit,
    }
  }

  preview(deviceId: string | undefined, channelId: string, itemId: string, previewId: string): BinaryObject {
    if (deviceId) this.channels.requireReceiver(channelId, deviceId)
    const row = this.repo.previewObject(itemId, previewId, channelId)
    if (!row) throw notFound("Preview not found")
    return { path: row.path, mimeType: row.mime_type, size: row.size, sha256: row.sha256 }
  }

  content(deviceId: string | undefined, channelId: string, itemId: string, contentId: string): BinaryObject {
    if (deviceId) this.channels.requireReceiver(channelId, deviceId)
    const row = this.repo.contentObject(itemId, contentId, channelId)
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
    if (input.memberDeviceId) this.channels.requireReceiver(input.channelId, input.memberDeviceId)
    const row = this.repo.requestableContent(input.itemId, input.contentId)
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
    let request = this.repo.materializationRequest(activeKey)
    const now = Date.now()
    if (request && request.expires_at <= now) {
      this.failMaterialization(request.id, "transfer_expired", "Materialization request expired", "expired")
      request = undefined
    }
    if (request) {
      const existing = this.repo.waiterTransfer(request.id, input.requesterKind, input.requesterId)
      if (existing) return { transfer: this.transfers.get(existing) }
    }

    return this.repo.transaction(() => {
      if (!request) {
        const requestId = createId()
        const expiresAt = now + this.config.materializationTtlMillis
        this.repo.createMaterializationRequest({
          id: requestId, activeKey, channelId: input.channelId, itemId: input.itemId,
          contentId: input.contentId, sourceDeviceId: row.origin_device_id, workId: createId(), now, expiresAt,
        })
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
      this.repo.addWaiter(request.id, transfer.id, input.requesterKind, input.requesterId)
      return { transfer }
    })
  }

  work(deviceId: string, cursor: string | undefined, limit: number) {
    if (isVirtualDevice(deviceId)) {
      throw new DomainError("virtual_device_receive_forbidden", "Virtual device does not receive channel content", 403)
    }
    this.expireMaterializations()
    const sequence = Cursor.decode(cursor)
    const rows = this.repo.work(deviceId, sequence, limit + 1)
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
    if (isVirtualDevice(deviceId)) {
      throw new DomainError("virtual_device_receive_forbidden", "Virtual device does not receive channel content", 403)
    }
    const work = this.repo.workItem(workId)
    if (!work || work.source_device_id !== deviceId) throw notFound("Work item not found")
    const previous = this.repo.uploadByWork(workId)
    if (previous) return { uploadId: previous.id, transfer: this.transfers.get(previous.transfer_id, deviceId) }
    if (work.state !== "queued") throw new DomainError("invalid_request", "Work item is not available", 409)
    const representation = this.repo.representation(work.item_id, work.content_id)
    if (!representation) throw notFound("Content not found")
    const now = Date.now()
    return this.repo.transaction(() => {
      const transfer = this.transfers.create({
        deviceId,
        itemId: work.item_id,
        kind: "content",
        direction: "upload",
        state: "queued",
        totalBytes: representation.size,
        expiresAt: now + this.config.materializationTtlMillis,
      })
      const uploadId = createId()
      this.repo.createMaterializationUpload({ uploadId, deviceId, transferId: transfer.id, work, representation, now })
      return { uploadId, transfer }
    })
  }

  rejectWork(deviceId: string, workId: string, code: string, message: string): void {
    if (isVirtualDevice(deviceId)) {
      throw new DomainError("virtual_device_receive_forbidden", "Virtual device does not receive channel content", 403)
    }
    const work = this.repo.workItem(workId)
    if (!work || work.source_device_id !== deviceId) throw notFound("Work item not found")
    if (work.state === "rejected") return
    const state = code === "source_content_missing" ? "expired" : "failed"
    this.repo.rejectWork(workId, Date.now())
    this.failMaterialization(work.request_id, code, message || code, state)
  }

  deleteItem(itemId: string, channelId?: string, memberDeviceId?: string): void {
    const row = this.itemRow(itemId)
    if (!row || (channelId && row.channel_id !== channelId)) throw notFound("Clipboard item not found")
    if (memberDeviceId) this.channels.requireMember(row.channel_id, memberDeviceId)
    if (row.deleted_at) return
    const now = Date.now()
    this.repo.transaction(() => this.repo.deleteItem(row, now))
  }

  private createUploadForExisting(deviceId: string, channelId: string, itemId: string): Publication {
    const objects = this.repo.eagerUploadObjects(itemId)
    const totalBytes = objects.reduce((sum, object) => sum + object.size, 0)
    const transfer = this.transfers.create({
      deviceId,
      itemId,
      kind: "publish",
      direction: "upload",
      state: "queued",
      totalBytes,
      peerDeviceIds: this.channels.recipients(channelId, deviceId),
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    const uploadId = createId()
    const now = Date.now()
    this.repo.transaction(() => this.repo.createPublicationUpload({
      id: uploadId, itemId, channelId, deviceId, transferId: transfer.id,
      now, expiresAt: now + 60 * 60 * 1000, objects,
    }))
    if (objects.length === 0) this.completeUpload(uploadId, deviceId)
    return this.publication(this.repo.upload(uploadId)!)
  }

  private progressMaterializationWaiters(uploadTransferId: string, completedBytes: number): void {
    const requestId = this.repo.materializationRequestIdForTransfer(uploadTransferId)
    if (!requestId) return
    for (const transferId of this.repo.waiterTransferIds(requestId)) {
      const transfer = this.transfers.get(transferId)
      if (!["completed", "failed", "cancelled", "expired"].includes(transfer.state)) {
        this.transfers.update(transferId, "transferring", Math.min(completedBytes, transfer.totalBytes))
      }
    }
  }

  private expireMaterializations(): void {
    for (const requestId of this.repo.expiredMaterializationIds(Date.now())) {
      this.failMaterialization(requestId, "transfer_expired", "Materialization request expired", "expired")
    }
  }

  private publication(upload: UploadRow): Publication {
    const objects = this.repo.uploadObjects(upload.id, true)
    return {
      itemId: upload.item_id,
      uploadId: upload.id,
      previewIds: objects.filter((object) => object.object_kind === "preview").map((object) => object.object_id),
      contentIds: objects.filter((object) => object.object_kind === "content").map((object) => object.object_id),
      transfer: this.transfers.get(upload.transfer_id),
    }
  }

  private completePublication(upload: UploadRow, objects: readonly UploadObjectRow[]): void {
    for (const object of objects) this.repo.attachPublishedObject(upload, object)
    const item = this.itemRow(upload.item_id, false)
    if (!item) throw new Error("Publication item is missing")
    if (!item.visible) {
      const now = Date.now()
      this.repo.publishItem(upload, now)
    }
  }

  private completeMaterialization(upload: UploadRow, objects: readonly UploadObjectRow[]): void {
    const object = objects[0]
    if (!object) throw new Error("Materialization upload is incomplete")
    const work = this.repo.attachMaterializedObject(upload, object)
    const now = Date.now()
    this.repo.completeMaterialization(work, now)
    for (const transferId of this.repo.waiterTransferIds(work.request_id)) {
      const transfer = this.transfers.get(transferId)
      this.transfers.update(transferId, "completed", transfer.totalBytes)
    }
  }

  private failMaterialization(
    requestId: string,
    code: string,
    message: string,
    state: "failed" | "expired",
  ): void {
    const request = this.repo.materializationTarget(requestId)
    if (!request) return
    const now = Date.now()
    this.repo.transaction(() => {
      this.repo.failMaterialization(requestId, request, state, now)
      for (const transferId of this.repo.waiterTransferIds(requestId)) {
        const transfer = this.transfers.get(transferId)
        this.transfers.update(transferId, state, transfer.completedBytes, { code, message })
      }
    })
  }

  private itemRow(itemId: string, visible = true): ItemRow | undefined {
    return this.repo.item(itemId, visible)
  }

  private itemOf(row: ItemRow): ClipboardItem {
    const contents = this.repo.contents(row.id).map((content) => ({
      id: content.id,
      mimeType: content.mime_type,
      size: content.size,
      sha256: content.sha256,
      delivery: content.delivery,
      availability: content.availability,
    }))
    const previews = this.repo.previews(row.id).map((preview) => ({
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
      origin: {
        deviceId: row.origin_device_id,
        tag: row.tag,
        iconKind: row.icon_kind,
        iconColor: {
          light: row.icon_color_light,
          ...(row.icon_color_dark ? { dark: row.icon_color_dark } : {}),
        },
        kind: isVirtualDevice(row.origin_device_id) ? "virtual" : "client",
      },
      contents,
      previews,
    }
  }

  private manifestMatches(manifest: ItemManifest): boolean {
    const contents = this.repo.contents(manifest.id)
    const previews = this.repo.previews(manifest.id)
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

export const clipboardService = new ClipboardService()
