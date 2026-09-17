import { sql, type SQL } from "drizzle-orm"
import { db } from "../db"
import type { ItemManifest } from "../service/clipboard"
import { sqliteValue } from "../common/sqlite"

export interface ItemRow {
  readonly id: string; readonly channel_id: string; readonly origin_device_id: string
  readonly created_at: number; readonly updated_at: number; readonly deleted_at: number | null
  readonly visible: number; readonly tag: string; readonly icon_kind: string
  readonly icon_color_light: string; readonly icon_color_dark: string | null; readonly channel_name: string
}
export interface RepresentationRow {
  readonly item_id: string; readonly id: string; readonly mime_type: string; readonly size: number
  readonly sha256: string; readonly delivery: "eager" | "on-demand"; readonly availability: string
  readonly object_id: string | null
}
export interface PreviewRow {
  readonly item_id: string; readonly id: string; readonly content_id: string; readonly mime_type: string
  readonly size: number; readonly sha256: string; readonly truncated: number; readonly object_id: string | null
}
export interface UploadRow {
  readonly id: string; readonly item_id: string; readonly channel_id: string; readonly device_id: string
  readonly transfer_id: string; readonly kind: "publish" | "materialize"; readonly state: string
  readonly work_id: string | null; readonly created_at: number; readonly expires_at: number
}
export interface UploadObjectRow {
  readonly upload_id: string; readonly object_kind: "preview" | "content"; readonly object_id: string
  readonly expected_size: number; readonly expected_sha256: string; readonly mime_type: string
  readonly stored_object_id: string | null; readonly uploaded_at: number | null
}
export interface ObjectRow {
  readonly id: string; readonly sha256: string; readonly size: number; readonly path: string
  readonly ref_count: number; readonly created_at: number
}
export interface WorkRow {
  readonly sequence: number; readonly id: string; readonly source_device_id: string; readonly request_id: string
  readonly item_id: string; readonly content_id: string; readonly state: string
  readonly created_at: number; readonly updated_at: number
}

export interface ItemListFilter {
  readonly channelId?: string; readonly deviceId?: string; readonly mimeType?: string; readonly query?: string
  readonly cursor?: { readonly createdAt: number; readonly id: string }; readonly limit: number
}

export interface ClipboardCleanupPolicy {
  readonly maxItems?: number
  readonly maxItemsPerChannel?: number
  readonly maxItemsPerDevice?: number
  readonly maxItemsPerDevicePerChannel?: number
  readonly maxAgeMillis?: number
}

export class ClipboardRepo {
  private get connection() { return db }
  private first<Row>(query: SQL): Row | undefined {
    return this.all<Row>(query)[0]
  }
  private all<Row>(query: SQL): readonly Row[] {
    return sqliteValue(db.all<Row>(query)) as Row[]
  }
  transaction<Result>(callback: () => Result): Result { return db.transaction(callback) }

  statusMetrics() {
    const pendingItems = Number(this.first<{ count: number }>(sql`
      SELECT count(*) AS count FROM clipboard_items WHERE visible = 0 AND deleted_at IS NULL
    `)?.count ?? 0)
    const activeTransfers = Number(this.first<{ count: number }>(sql`
      SELECT count(*) AS count FROM transfers
      WHERE state NOT IN ('completed', 'failed', 'cancelled', 'expired')
    `)?.count ?? 0)
    const activity = this.first<{ last_sync_at: number; revision: number }>(sql`
      SELECT COALESCE((SELECT max(created_at) FROM changes), 0) AS last_sync_at,
             COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'changes'), 0) AS revision
    `)
    return { pendingItems, activeTransfers, lastSyncAt: activity?.last_sync_at ?? 0, revision: activity?.revision ?? 0 }
  }

  item(id: string, visible = true): ItemRow | undefined {
    if (!visible) return this.first<ItemRow>(sql`
      SELECT i.*, d.tag, d.icon_kind, d.icon_color_light, d.icon_color_dark, c.name AS channel_name
      FROM clipboard_items i JOIN devices d ON d.id = i.origin_device_id
      JOIN channels c ON c.id = i.channel_id
      WHERE i.id = ${id}
    `) ?? undefined
    return this.first<ItemRow>(sql`
      SELECT i.*, d.tag, d.icon_kind, d.icon_color_light, d.icon_color_dark, c.name AS channel_name
      FROM clipboard_items i JOIN devices d ON d.id = i.origin_device_id
      JOIN channels c ON c.id = i.channel_id
      WHERE i.id = ${id} AND i.visible = 1 AND i.deleted_at IS NULL
    `) ?? undefined
  }

  contents(itemId: string): readonly RepresentationRow[] {
    return this.all<RepresentationRow>(sql`
      SELECT * FROM representations WHERE item_id = ${itemId} ORDER BY id
    `)
  }

  previews(itemId: string): readonly PreviewRow[] {
    return this.all<PreviewRow>(sql`
      SELECT * FROM previews WHERE item_id = ${itemId} ORDER BY id
    `)
  }

  latestPublicationUpload(itemId: string): UploadRow | undefined {
    return this.first<UploadRow>(sql`
      SELECT * FROM uploads
      WHERE item_id = ${itemId} AND kind = 'publish'
      ORDER BY created_at DESC LIMIT 1
    `) ?? undefined
  }

  insertManifest(deviceId: string, channelId: string, manifest: ItemManifest, now: number): void {
    this.connection.run(sql`
      INSERT INTO clipboard_items(id, channel_id, origin_device_id, created_at, updated_at, visible)
      VALUES (${manifest.id}, ${channelId}, ${deviceId}, ${manifest.createdAt}, ${now}, 0)
    `)
    for (const content of manifest.contents) this.connection.run(sql`
      INSERT INTO representations(item_id, id, mime_type, size, sha256, delivery, availability)
      VALUES (${manifest.id}, ${content.id}, ${content.mimeType}, ${content.size}, ${content.sha256},
              ${content.delivery}, ${content.delivery === "eager" ? "failed" : "source-required"})
    `)
    for (const preview of manifest.previews) this.connection.run(sql`
      INSERT INTO previews(item_id, id, content_id, mime_type, size, sha256, truncated)
      VALUES (${manifest.id}, ${preview.id}, ${preview.contentId}, ${preview.mimeType}, ${preview.size},
              ${preview.sha256}, ${preview.truncated ? 1 : 0})
    `)
  }

  upload(id: string): UploadRow | undefined {
    return this.first<UploadRow>(sql`SELECT * FROM uploads WHERE id = ${id}`)
  }
  uploadByWork(workId: string): UploadRow | undefined {
    return this.first<UploadRow>(sql`SELECT * FROM uploads WHERE work_id = ${workId}`)
  }
  uploadObject(uploadId: string, kind: string, objectId: string): UploadObjectRow | undefined {
    return this.first<UploadObjectRow>(sql`
      SELECT * FROM upload_objects
      WHERE upload_id = ${uploadId} AND object_kind = ${kind} AND object_id = ${objectId}
    `) ?? undefined
  }
  uploadObjects(uploadId: string, ordered = false): readonly UploadObjectRow[] {
    if (ordered) {
      const query = sql`
      SELECT * FROM upload_objects WHERE upload_id = ${uploadId}
      ORDER BY object_kind DESC, object_id
      `
      return this.all<UploadObjectRow>(query)
    }
    return this.all<UploadObjectRow>(sql`SELECT * FROM upload_objects WHERE upload_id = ${uploadId}`)
  }
  uploadedBytes(uploadId: string, excluding?: { readonly kind: string; readonly id: string }): number {
    if (excluding) return this.first<{ total: number }>(sql`
      SELECT COALESCE(sum(expected_size), 0) AS total FROM upload_objects
      WHERE upload_id = ${uploadId} AND uploaded_at IS NOT NULL
        AND NOT (object_kind = ${excluding.kind} AND object_id = ${excluding.id})
    `)?.total ?? 0
    return this.first<{ total: number }>(sql`
      SELECT COALESCE(sum(expected_size), 0) AS total FROM upload_objects
      WHERE upload_id = ${uploadId} AND uploaded_at IS NOT NULL
    `)?.total ?? 0
  }
  missingUploadObjectCount(uploadId: string): number {
    return this.first<{ count: number }>(sql`
      SELECT count(*) AS count FROM upload_objects
      WHERE upload_id = ${uploadId} AND stored_object_id IS NULL
    `)?.count ?? 0
  }

  storeObject(input: { readonly id: string; readonly sha256: string; readonly size: number; readonly path: string; readonly now: number }): ObjectRow {
    this.connection.run(sql`
      INSERT INTO objects(id, sha256, size, path, ref_count, created_at, unreferenced_at)
      VALUES (${input.id}, ${input.sha256}, ${input.size}, ${input.path}, 0, ${input.now}, ${input.now})
      ON CONFLICT(sha256, size) DO NOTHING
    `)
    const row = this.first<ObjectRow>(sql`
      SELECT * FROM objects WHERE sha256 = ${input.sha256} AND size = ${input.size}
    `)
    if (!row) throw new Error("Stored object metadata could not be resolved")
    return row
  }
  attachUploadObject(uploadId: string, kind: string, objectId: string, storedObjectId: string, now: number): void {
    this.connection.run(sql`
      UPDATE upload_objects SET stored_object_id = ${storedObjectId}, uploaded_at = COALESCE(uploaded_at, ${now})
      WHERE upload_id = ${uploadId} AND object_kind = ${kind} AND object_id = ${objectId}
    `)
  }
  completeUpload(id: string): void {
    this.connection.run(sql`UPDATE uploads SET state = 'completed' WHERE id = ${id}`)
  }

  changes(channelId: string, after: number, limit: number) {
    return this.all<{ sequence: number; kind: "upsert" | "remove"; item_id: string; reason: string }>(sql`
      SELECT sequence, kind, item_id, reason FROM changes
      WHERE channel_id = ${channelId} AND sequence > ${after}
      ORDER BY sequence LIMIT ${limit}
    `)
  }

  list(input: ItemListFilter): readonly ItemRow[] {
    const conditions: SQL[] = [sql`i.visible = 1`, sql`i.deleted_at IS NULL`, sql`c.deleted_at IS NULL`]
    if (input.channelId) conditions.push(sql`i.channel_id = ${input.channelId}`)
    if (input.deviceId) conditions.push(sql`i.origin_device_id = ${input.deviceId}`)
    if (input.mimeType) {
      const mimeType = input.mimeType.endsWith("/") ? `${input.mimeType}%` : input.mimeType
      conditions.push(sql`
        EXISTS (SELECT 1 FROM representations rf WHERE rf.item_id = i.id AND rf.mime_type LIKE ${mimeType})
      `)
    }
    if (input.query) {
      const escaped = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`
      conditions.push(sql`(d.tag LIKE ${escaped} ESCAPE '\\' OR c.name LIKE ${escaped} ESCAPE '\\')`)
    }
    if (input.cursor) {
      conditions.push(sql`
        (i.created_at < ${input.cursor.createdAt}
          OR (i.created_at = ${input.cursor.createdAt} AND i.id < ${input.cursor.id}))
      `)
    }
    return this.all<ItemRow>(sql`
      SELECT i.*, d.tag, d.icon_kind, d.icon_color_light, d.icon_color_dark, c.name AS channel_name FROM clipboard_items i
      JOIN devices d ON d.id = i.origin_device_id JOIN channels c ON c.id = i.channel_id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY i.created_at DESC, i.id DESC LIMIT ${input.limit}
    `)
  }

  cleanupCandidates(policy: ClipboardCleanupPolicy, now: number, limit: number, scope?: {
    readonly deviceId: string; readonly channelId: string
  }): readonly string[] {
    const eligible = sql`
      AND NOT EXISTS (
        SELECT 1 FROM uploads u WHERE u.item_id = i.id AND u.state <> 'completed' AND u.expires_at > ${now}
      )
      AND NOT EXISTS (
        SELECT 1 FROM materialization_requests m WHERE m.item_id = i.id AND m.active_key IS NOT NULL AND m.expires_at > ${now}
      )
    `
    if (scope) {
      const excess: SQL[] = []
      if (policy.maxItemsPerDevice !== undefined) excess.push(sql`
        i.id IN (SELECT id FROM clipboard_items
          WHERE origin_device_id = ${scope.deviceId} AND visible = 1 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ${policy.maxItemsPerDevice})
      `)
      if (policy.maxItemsPerChannel !== undefined) excess.push(sql`
        i.id IN (SELECT id FROM clipboard_items
          WHERE channel_id = ${scope.channelId} AND visible = 1 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ${policy.maxItemsPerChannel})
      `)
      if (policy.maxItemsPerDevicePerChannel !== undefined) excess.push(sql`
        i.id IN (SELECT id FROM clipboard_items
          WHERE origin_device_id = ${scope.deviceId} AND channel_id = ${scope.channelId}
            AND visible = 1 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ${policy.maxItemsPerDevicePerChannel})
      `)
      if (policy.maxAgeMillis !== undefined) excess.push(sql`
        i.created_at < ${now - policy.maxAgeMillis}
          AND (i.origin_device_id = ${scope.deviceId} OR i.channel_id = ${scope.channelId})
      `)
      if (excess.length === 0) return []
      return this.all<{ id: string }>(sql`
        SELECT i.id FROM clipboard_items i
        WHERE i.visible = 1 AND i.deleted_at IS NULL AND (${sql.join(excess, sql` OR `)})
          ${eligible}
        ORDER BY i.created_at, i.id LIMIT ${limit}
      `).map((row) => row.id)
    }
    const excess: SQL[] = []
    if (policy.maxItems !== undefined) excess.push(sql`global_position > ${policy.maxItems}`)
    if (policy.maxItemsPerDevice !== undefined) excess.push(sql`device_position > ${policy.maxItemsPerDevice}`)
    if (policy.maxItemsPerChannel !== undefined) excess.push(sql`channel_position > ${policy.maxItemsPerChannel}`)
    if (policy.maxItemsPerDevicePerChannel !== undefined) {
      excess.push(sql`device_channel_position > ${policy.maxItemsPerDevicePerChannel}`)
    }
    if (policy.maxAgeMillis !== undefined) excess.push(sql`created_at < ${now - policy.maxAgeMillis}`)
    if (excess.length === 0) return []
    return this.all<{ id: string }>(sql`
      WITH ranked AS (
        SELECT id, origin_device_id, channel_id, created_at,
          row_number() OVER (ORDER BY created_at DESC, id DESC) AS global_position,
          row_number() OVER (PARTITION BY origin_device_id ORDER BY created_at DESC, id DESC) AS device_position,
          row_number() OVER (PARTITION BY channel_id ORDER BY created_at DESC, id DESC) AS channel_position,
          row_number() OVER (
            PARTITION BY origin_device_id, channel_id ORDER BY created_at DESC, id DESC
          ) AS device_channel_position
        FROM clipboard_items WHERE visible = 1 AND deleted_at IS NULL
      )
      SELECT i.id FROM ranked i WHERE (${sql.join(excess, sql` OR `)})
        ${eligible}
      ORDER BY i.created_at, i.id LIMIT ${limit}
    `).map((row) => row.id)
  }

  previewObject(itemId: string, previewId: string, channelId: string):
    (PreviewRow & Pick<ObjectRow, "path">) | undefined {
    return this.first<PreviewRow & Pick<ObjectRow, "path">>(sql`
      SELECT p.*, o.path FROM previews p JOIN clipboard_items i ON i.id = p.item_id
      JOIN objects o ON o.id = p.object_id
      WHERE p.item_id = ${itemId} AND p.id = ${previewId} AND i.channel_id = ${channelId}
        AND i.visible = 1 AND i.deleted_at IS NULL
    `) ?? undefined
  }
  contentObject(itemId: string, contentId: string, channelId: string):
    (RepresentationRow & { readonly path: string | null }) | undefined {
    return this.first<RepresentationRow & { readonly path: string | null }>(sql`
      SELECT r.*, o.path FROM representations r JOIN clipboard_items i ON i.id = r.item_id
      LEFT JOIN objects o ON o.id = r.object_id
      WHERE r.item_id = ${itemId} AND r.id = ${contentId} AND i.channel_id = ${channelId}
        AND i.visible = 1 AND i.deleted_at IS NULL
    `) ?? undefined
  }
  requestableContent(itemId: string, contentId: string):
    (RepresentationRow & { readonly channel_id: string; readonly origin_device_id: string }) | undefined {
    return this.first<RepresentationRow & { channel_id: string; origin_device_id: string }>(sql`
      SELECT r.*, i.channel_id, i.origin_device_id FROM representations r
      JOIN clipboard_items i ON i.id = r.item_id
      WHERE r.item_id = ${itemId} AND r.id = ${contentId}
        AND i.visible = 1 AND i.deleted_at IS NULL
    `) ?? undefined
  }
  materializationRequest(activeKey: string): { readonly id: string; readonly expires_at: number } | undefined {
    return this.first<{ id: string; expires_at: number }>(sql`
      SELECT id, expires_at FROM materialization_requests WHERE active_key = ${activeKey}
    `) ?? undefined
  }
  waiterTransfer(requestId: string, requesterKind: string, requesterId: string): string | undefined {
    return this.first<{ transfer_id: string }>(sql`
      SELECT transfer_id FROM materialization_waiters
      WHERE request_id = ${requestId} AND requester_kind = ${requesterKind} AND requester_id = ${requesterId}
    `)?.transfer_id
  }
  createMaterializationRequest(input: {
    readonly id: string; readonly activeKey: string; readonly channelId: string; readonly itemId: string
    readonly contentId: string; readonly sourceDeviceId: string; readonly workId: string
    readonly now: number; readonly expiresAt: number
  }): void {
    this.connection.run(sql`
      INSERT INTO materialization_requests(id, active_key, channel_id, item_id, content_id, source_device_id,
        state, created_at, updated_at, expires_at)
      VALUES (${input.id}, ${input.activeKey}, ${input.channelId}, ${input.itemId}, ${input.contentId},
        ${input.sourceDeviceId}, 'waiting-for-peer', ${input.now}, ${input.now}, ${input.expiresAt})
    `)
    this.connection.run(sql`
      INSERT INTO work_queue(id, source_device_id, request_id, item_id, content_id, state, created_at, updated_at)
      VALUES (${input.workId}, ${input.sourceDeviceId}, ${input.id}, ${input.itemId}, ${input.contentId},
        'queued', ${input.now}, ${input.now})
    `)
    this.connection.run(sql`
      UPDATE representations SET availability = 'requesting'
      WHERE item_id = ${input.itemId} AND id = ${input.contentId}
    `)
  }
  addWaiter(requestId: string, transferId: string, requesterKind: string, requesterId: string): void {
    this.connection.run(sql`
      INSERT INTO materialization_waiters(request_id, transfer_id, requester_kind, requester_id)
      VALUES (${requestId}, ${transferId}, ${requesterKind}, ${requesterId})
    `)
  }
  work(deviceId: string, after: number, limit: number): readonly WorkRow[] {
    return this.all<WorkRow>(sql`
      SELECT * FROM work_queue
      WHERE source_device_id = ${deviceId} AND sequence > ${after}
      ORDER BY sequence LIMIT ${limit}
    `)
  }
  workItem(id: string): WorkRow | undefined {
    return this.first<WorkRow>(sql`SELECT * FROM work_queue WHERE id = ${id}`)
  }
  representation(itemId: string, contentId: string): RepresentationRow | undefined {
    return this.first<RepresentationRow>(sql`
      SELECT * FROM representations WHERE item_id = ${itemId} AND id = ${contentId}
    `) ?? undefined
  }
  createMaterializationUpload(input: {
    readonly uploadId: string; readonly deviceId: string; readonly transferId: string; readonly work: WorkRow
    readonly representation: RepresentationRow; readonly now: number
  }): void {
    this.connection.run(sql`
      INSERT INTO uploads(id, item_id, channel_id, device_id, transfer_id, kind, state, work_id, created_at, expires_at)
      SELECT ${input.uploadId}, m.item_id, m.channel_id, ${input.deviceId}, ${input.transferId},
        'materialize', 'open', ${input.work.id}, ${input.now}, m.expires_at
      FROM materialization_requests m WHERE m.id = ${input.work.request_id}
    `)
    this.connection.run(sql`
      INSERT INTO upload_objects(upload_id, object_kind, object_id, expected_size, expected_sha256, mime_type)
      VALUES (${input.uploadId}, 'content', ${input.representation.id}, ${input.representation.size},
        ${input.representation.sha256}, ${input.representation.mime_type})
    `)
    this.connection.run(sql`
      UPDATE work_queue SET state = 'accepted', updated_at = ${input.now} WHERE id = ${input.work.id}
    `)
    this.connection.run(sql`
      UPDATE materialization_requests SET state = 'transferring', updated_at = ${input.now}
      WHERE id = ${input.work.request_id}
    `)
  }
  rejectWork(id: string, now: number): void {
    this.connection.run(sql`UPDATE work_queue SET state = 'rejected', updated_at = ${now} WHERE id = ${id}`)
  }

  deleteItem(item: ItemRow, now: number): void {
    this.removeItem(item, now, true)
  }

  pruneItem(id: string, now: number): boolean {
    const item = this.item(id, false)
    if (!item || !item.visible || item.deleted_at !== null) return false
    this.removeItem(item, now, false)
    return true
  }

  private removeItem(item: ItemRow, now: number, notifyClients: boolean): void {
    this.connection.run(sql`
      UPDATE transfers SET state = 'expired', error_code = 'item_removed',
        error_message = 'Clipboard item was removed', updated_at = ${now}
      WHERE item_id = ${item.id} AND state NOT IN ('completed', 'failed', 'cancelled', 'expired')
    `)
    this.connection.run(sql`
      UPDATE materialization_requests SET active_key = NULL, state = 'expired', updated_at = ${now}
      WHERE item_id = ${item.id} AND active_key IS NOT NULL
    `)
    this.connection.run(sql`
      UPDATE work_queue SET state = 'expired', updated_at = ${now}
      WHERE item_id = ${item.id} AND state = 'queued'
    `)
    this.connection.run(sql`
      UPDATE uploads SET state = 'expired' WHERE item_id = ${item.id} AND state <> 'completed'
    `)
    const references = this.all<{ object_id: string; count: number }>(sql`
      SELECT object_id, count(*) AS count FROM (
      SELECT object_id FROM representations WHERE item_id = ${item.id} AND object_id IS NOT NULL
      UNION ALL SELECT object_id FROM previews WHERE item_id = ${item.id} AND object_id IS NOT NULL
      ) GROUP BY object_id
    `)
    for (const reference of references) this.connection.run(sql`
      UPDATE objects SET ref_count = max(0, ref_count - ${reference.count}),
        unreferenced_at = CASE WHEN ref_count <= ${reference.count} THEN ${now} ELSE NULL END
      WHERE id = ${reference.object_id}
    `)
    this.connection.run(sql`DELETE FROM upload_objects WHERE upload_id IN (
      SELECT id FROM uploads WHERE item_id = ${item.id}
    )`)
    this.connection.run(sql`DELETE FROM previews WHERE item_id = ${item.id}`)
    this.connection.run(sql`DELETE FROM representations WHERE item_id = ${item.id}`)
    this.connection.run(sql`
      UPDATE clipboard_items SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${item.id}
    `)
    if (notifyClients) this.connection.run(sql`
      INSERT INTO changes(channel_id, kind, item_id, reason, created_at)
      VALUES (${item.channel_id}, 'remove', ${item.id}, 'deleted', ${now})
    `)
    else this.connection.run(sql`DELETE FROM changes WHERE item_id = ${item.id} AND kind = 'upsert'`)
  }

  eagerUploadObjects(itemId: string) {
    return [
      ...this.previews(itemId).map((row) => ({ kind: "preview" as const, id: row.id, size: row.size, sha256: row.sha256, mime: row.mime_type })),
      ...this.contents(itemId).filter((row) => row.delivery === "eager")
        .map((row) => ({ kind: "content" as const, id: row.id, size: row.size, sha256: row.sha256, mime: row.mime_type })),
    ]
  }
  createPublicationUpload(input: {
    readonly id: string; readonly itemId: string; readonly channelId: string; readonly deviceId: string
    readonly transferId: string; readonly now: number; readonly expiresAt: number
    readonly objects: readonly { kind: string; id: string; size: number; sha256: string; mime: string }[]
  }): void {
    this.connection.run(sql`
      INSERT INTO uploads(id, item_id, channel_id, device_id, transfer_id, kind, state, created_at, expires_at)
      VALUES (${input.id}, ${input.itemId}, ${input.channelId}, ${input.deviceId}, ${input.transferId},
        'publish', 'open', ${input.now}, ${input.expiresAt})
    `)
    for (const object of input.objects) this.connection.run(sql`
      INSERT INTO upload_objects(upload_id, object_kind, object_id, expected_size, expected_sha256, mime_type)
      VALUES (${input.id}, ${object.kind}, ${object.id}, ${object.size}, ${object.sha256}, ${object.mime})
    `)
  }
  materializationRequestIdForTransfer(transferId: string): string | undefined {
    const upload = this.first<{ work_id: string | null }>(sql`
      SELECT work_id FROM uploads WHERE transfer_id = ${transferId} AND kind = 'materialize'
    `)
    if (!upload?.work_id) return undefined
    return this.first<{ request_id: string }>(sql`
      SELECT request_id FROM work_queue WHERE id = ${upload.work_id}
    `)?.request_id
  }
  waiterTransferIds(requestId: string): readonly string[] {
    return this.all<{ transfer_id: string }>(sql`
      SELECT transfer_id FROM materialization_waiters WHERE request_id = ${requestId}
    `).map((row) => row.transfer_id)
  }
  expiredMaterializationIds(now: number): readonly string[] {
    return this.all<{ id: string }>(sql`
      SELECT id FROM materialization_requests WHERE active_key IS NOT NULL AND expires_at <= ${now}
    `).map((row) => row.id)
  }
  attachPublishedObject(upload: UploadRow, object: UploadObjectRow): void {
    if (!object.stored_object_id) throw new Error("Upload object is missing")
    if (object.object_kind === "preview") this.connection.run(sql`
      UPDATE previews SET object_id = ${object.stored_object_id}
      WHERE item_id = ${upload.item_id} AND id = ${object.object_id}
    `)
    else this.connection.run(sql`
      UPDATE representations SET object_id = ${object.stored_object_id}, availability = 'available'
      WHERE item_id = ${upload.item_id} AND id = ${object.object_id}
    `)
    this.incrementObjectReference(object.stored_object_id)
  }
  publishItem(upload: UploadRow, now: number): void {
    this.connection.run(sql`
      UPDATE clipboard_items SET visible = 1, updated_at = ${now} WHERE id = ${upload.item_id}
    `)
    this.connection.run(sql`
      INSERT INTO changes(channel_id, kind, item_id, created_at)
      VALUES (${upload.channel_id}, 'upsert', ${upload.item_id}, ${now})
    `)
  }
  attachMaterializedObject(upload: UploadRow, object: UploadObjectRow): WorkRow {
    if (!object.stored_object_id || !upload.work_id) throw new Error("Materialization upload is incomplete")
    this.connection.run(sql`
      UPDATE representations SET object_id = ${object.stored_object_id}, availability = 'available'
      WHERE item_id = ${upload.item_id} AND id = ${object.object_id}
    `)
    this.incrementObjectReference(object.stored_object_id)
    const work = this.workItem(upload.work_id)
    if (!work) throw new Error("Materialization work is missing")
    return work
  }
  completeMaterialization(work: WorkRow, now: number): void {
    this.connection.run(sql`
      UPDATE work_queue SET state = 'completed', updated_at = ${now} WHERE id = ${work.id}
    `)
    this.connection.run(sql`
      UPDATE materialization_requests SET active_key = NULL, state = 'completed', updated_at = ${now}
      WHERE id = ${work.request_id}
    `)
  }
  materializationTarget(requestId: string): { readonly item_id: string; readonly content_id: string } | undefined {
    return this.first<{ item_id: string; content_id: string }>(sql`
      SELECT item_id, content_id FROM materialization_requests WHERE id = ${requestId}
    `) ?? undefined
  }
  failMaterialization(requestId: string, target: { item_id: string; content_id: string }, state: string, now: number): void {
    this.connection.run(sql`
      UPDATE materialization_requests SET active_key = NULL, state = ${state}, updated_at = ${now}
      WHERE id = ${requestId}
    `)
    this.connection.run(sql`
      UPDATE work_queue SET state = ${state}, updated_at = ${now}
      WHERE request_id = ${requestId} AND state = 'queued'
    `)
    this.connection.run(sql`
      UPDATE representations SET availability = ${state}
      WHERE item_id = ${target.item_id} AND id = ${target.content_id}
    `)
  }
  private incrementObjectReference(id: string): void {
    this.connection.run(sql`UPDATE objects SET ref_count = ref_count + 1, unreferenced_at = NULL WHERE id = ${id}`)
  }
}
