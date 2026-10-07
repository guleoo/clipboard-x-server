import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { sqliteValue } from "../../src/common/sqlite";
import { CleanupOptions, config } from "../../src/config";
import { createApp, mountRoutes } from "../../src/frame/hono";
import { Provider } from "../../src/frame/core";
import { SecurityFrameService } from "../../src/frame/security";
import { Database, db } from "../../src/db";
import { databaseConfig } from "../../src/frame/db";
import { ClipboardRepo, type ClipboardCleanupPolicy } from "../../src/repo/clipboard";
import { objectStore } from "../../src/repo/object";
import { OBJECT_COLLECTION_GRACE_MILLIS, objectCollector } from "../../src/service/object-gc";
import { cleanupService } from "../../src/service/cleanup";
import { clipboardService } from "../../src/service/clipboard";
import { administratorService } from "../../src/service/administrator";
import { registerSecurity } from "../../src/session";
import { routes } from "../../src/route";
import { productErrorHandler } from "../../src/route/error";

const repo = new ClipboardRepo()
const deviceA = crypto.randomUUID()
const deviceB = crypto.randomUUID()
const deviceC = crypto.randomUUID()
const channelA = crypto.randomUUID()
const channelB = crypto.randomUUID()
const channelC = crypto.randomUUID()
let previousSecurity: SecurityFrameService | undefined

function objectReferences(id: string): number | undefined {
  return sqliteValue(db.all<{ ref_count: number }>(sql`SELECT ref_count FROM objects WHERE id = ${id}`))[0]?.ref_count
}

function addItem(channelId: string, deviceId: string, createdAt: number, objectId?: string, sha256 = "a".repeat(64)): string {
  const id = crypto.randomUUID()
  db.run(sql`INSERT INTO clipboard_items (id, channel_id, origin_device_id, created_at, updated_at, visible)
    VALUES (${id}, ${channelId}, ${deviceId}, ${createdAt}, ${createdAt}, 1)`)
  db.run(sql`INSERT INTO changes (channel_id, kind, item_id, created_at) VALUES (${channelId}, 'upsert', ${id}, ${createdAt})`)
  if (objectId) db.run(sql`INSERT INTO representations
    (item_id, id, mime_type, size, sha256, delivery, availability, object_id)
    VALUES (${id}, 'primary', 'text/plain', 1, ${sha256}, 'eager', 'available', ${objectId})`)
  return id
}

function cleanupPolicy(clipboard: ClipboardCleanupPolicy = {}) {
  return CleanupOptions.parse({
    enabled: true,
    clipboard,
  })
}

  beforeAll(async () => {
  previousSecurity = Provider.has(SecurityFrameService)
    ? Provider.inject(SecurityFrameService)
    : undefined
  Database.init()
  Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder })
  await objectStore.initialize()
  for (const deviceId of [deviceA, deviceB, deviceC]) db.run(sql`INSERT INTO devices
    (id, tag, icon_kind, created_at, updated_at) VALUES (${deviceId}, 'Device', 'laptop', 1, 1)`)
  for (const channelId of [channelA, channelB, channelC]) db.run(sql`INSERT INTO channels
    (id, name, created_at, updated_at) VALUES (${channelId}, 'Channel', 1, 1)`)
  db.run(sql`INSERT INTO channel_members (channel_id, device_id, joined_at) VALUES (${channelA}, ${deviceA}, 1)`)
})

afterAll(() => {
  Provider.unprovide(SecurityFrameService)
  if (previousSecurity) Provider.provide(SecurityFrameService, previousSecurity)
})

describe("server-only cleanup", () => {
  it("authenticates cleanup settings, persists changes, and reconfigures the active scheduler", async () => {
    await administratorService.synchronize()
    Provider.unprovide(SecurityFrameService)
    registerSecurity()
    const app = createApp()
    app.onError(productErrorHandler)
    mountRoutes(app, routes)
    const path = "/admin/api/v1/configuration/cleanup"
    expect((await app.request(path)).status).toBe(401)
    const session = await administratorService.login("admin", "test-password")
    const headers = {
      Cookie: `clipboard_x_admin=${session.token}`,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
    }
    expect(await (await app.request(path, { headers })).json()).toEqual(config.cleanup)
    const original = config.cleanup
    const sweep = spyOn(cleanupService, "sweep")
    try {
      const invalid = await app.request(path, { method: "PATCH", headers, body: JSON.stringify({
        enabled: true, clipboard: { maxItemsPerDevice: 0 },
      }) })
      expect(invalid.status).toBe(400)
      const input = { enabled: true, intervalMillis: 60_000, clipboard: { maxItemsPerDevice: 10 } }
      const saved = await app.request(path, { method: "PATCH", headers, body: JSON.stringify(input) })
      expect(saved.status).toBe(200)
      expect(await saved.json()).toEqual(CleanupOptions.parse(input))
      expect(sweep).not.toHaveBeenCalled()
      expect(config.cleanup.clipboard.maxItemsPerDevice).toBe(10)
      expect(readFileSync(config.path, "utf8")).toContain("max-items-per-device: 10\n")
      expect(await (await app.request(path, { headers })).json()).toEqual(config.cleanup)
      const overridePath = join(dirname(config.path), "config-test.yaml")
      expect(existsSync(overridePath)).toBe(false)
      const savedYaml = readFileSync(config.path, "utf8")
      try {
        writeFileSync(overridePath, "cleanup:\n  enabled: false\n")
        const next = { enabled: true, clipboard: { maxItemsPerDevice: 20 } }
        const unaffected = await app.request(path, {
          method: "PATCH", headers, body: JSON.stringify(next),
        })
        expect(unaffected.status).toBe(200)
        expect(await unaffected.json()).toEqual(CleanupOptions.parse(next))
        expect(config.cleanup.clipboard.maxItemsPerDevice).toBe(20)
        expect(sweep).not.toHaveBeenCalled()
        expect(readFileSync(config.path, "utf8")).not.toBe(savedYaml)
      } finally {
        rmSync(overridePath, { force: true })
      }
    } finally {
      sweep.mockRestore()
      config.updateCleanup(original)
      cleanupService.configure()
    }
  })

  it("applies channel and cross-channel device limits without sending removal events", async () => {
    const first = addItem(channelA, deviceA, 10)
    const second = addItem(channelA, deviceA, 20)
    const third = addItem(channelB, deviceA, 30)
    const other = addItem(channelA, deviceB, 40)
    const revision = repo.statusMetrics().revision

    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxItemsPerChannel: 2 }))).toBe(1)
    expect(repo.item(first)).toBeUndefined()
    expect(repo.item(second)).toBeDefined()
    expect(repo.item(other)).toBeDefined()
    expect(repo.changes(channelA, 0, 20).map(({ item_id, kind }) => [item_id, kind]))
      .toEqual([[second, "upsert"], [other, "upsert"]])
    expect(repo.statusMetrics().revision).toBe(revision)

    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevice: 1 }),
    )).toBe(1)
    expect(repo.item(second)).toBeUndefined()
    expect(repo.item(third)).toBeDefined()
    expect(repo.item(other)).toBeDefined()
    expect(repo.changes(channelA, 0, 20).some(({ kind }) => kind === "remove")).toBe(false)
    expect(repo.statusMetrics().revision).toBe(revision)
    const another = addItem(channelB, deviceB, 50)
    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxItemsPerDevice: 1 }))).toBe(1)
    expect(repo.item(other)).toBeUndefined()
    expect(repo.item(another)).toBeDefined()
    expect(await cleanupService.enforceClipboard(cleanupPolicy({
      maxItemsPerDevice: 1,
      maxItemsPerChannel: 2,
    }))).toBe(0)
  })

  it("drains global and device-in-channel limits through internal batches", async () => {
    const device = crypto.randomUUID()
    const channel = crypto.randomUUID()
    const otherChannel = crypto.randomUUID()
    db.run(sql`INSERT INTO devices (id, tag, icon_kind, created_at, updated_at)
      VALUES (${device}, 'Cleanup device', 'laptop', 1, 1)`)
    db.run(sql`INSERT INTO channels (id, name, created_at, updated_at)
      VALUES (${channel}, 'Cleanup channel', 1, 1), (${otherChannel}, 'Other channel', 1, 1)`)
    const first = addItem(channel, device, 1_000)
    addItem(channel, device, 1_001)
    addItem(channel, device, 1_002)
    const outside = addItem(otherChannel, device, 1_003)

    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevicePerChannel: 2 }),
    )).toBe(1)
    expect(repo.item(first)).toBeUndefined()
    expect(repo.item(outside)).toBeDefined()

    addItem(channel, device, 1_004)
    addItem(channel, device, 1_005)
    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxItemsPerDevice: 1 }))).toBe(4)
    const remaining = sqliteValue(db.all<{ count: number }>(sql`
      SELECT count(*) AS count FROM clipboard_items
      WHERE origin_device_id = ${device} AND visible = 1 AND deleted_at IS NULL
    `))[0]?.count
    expect(remaining).toBe(1)

    const visibleBefore = sqliteValue(db.all<{ count: number }>(sql`
      SELECT count(*) AS count FROM clipboard_items WHERE visible = 1 AND deleted_at IS NULL
    `))[0]!.count
    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxItems: visibleBefore - 1 }))).toBe(1)
  })

  it("yields to request work between fixed cleanup batches", async () => {
    const device = crypto.randomUUID()
    const channel = crypto.randomUUID()
    db.run(sql`INSERT INTO devices (id, tag, icon_kind, created_at, updated_at)
      VALUES (${device}, 'Batch device', 'laptop', 1, 1)`)
    db.run(sql`INSERT INTO channels (id, name, created_at, updated_at)
      VALUES (${channel}, 'Batch channel', 1, 1)`)
    for (let index = 0; index < 52; index += 1) addItem(channel, device, index + 1)
    let requestWorkRan = false
    setTimeout(() => { requestWorkRan = true }, 0)

    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxItemsPerDevice: 1 }))).toBe(51)
    expect(requestWorkRan).toBe(true)
  })

  it("coalesces overlapping periodic sweeps", async () => {
    const original = config.cleanup
    try {
      config.updateCleanup({ enabled: true, intervalMillis: 60_000, clipboard: {} })
      cleanupService.configure()
      const first = cleanupService.sweep()
      expect(cleanupService.sweep()).toBe(first)
      await first
    } finally {
      config.updateCleanup(original)
      cleanupService.configure()
    }
  })

  it("keeps active materializations until finished and releases shared object references", async () => {
    const objectId = crypto.randomUUID()
    db.run(sql`INSERT INTO objects (id, sha256, size, path, ref_count, created_at)
      VALUES (${objectId}, ${"a".repeat(64)}, 1, '/tmp/retention-object', 2, 1)`)
    const earlier = addItem(channelC, deviceC, 1, objectId)
    const later = addItem(channelC, deviceC, 2, objectId)
    const requestId = crypto.randomUUID()
    db.run(sql`INSERT INTO materialization_requests
      (id, active_key, channel_id, item_id, content_id, source_device_id, state, created_at, updated_at, expires_at)
      VALUES (${requestId}, ${earlier}, ${channelC}, ${earlier}, 'primary', ${deviceC}, 'waiting-for-peer', 1, 1, ${Date.now() + 60_000})`)

    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevice: 1 }),
    )).toBe(0)
    db.run(sql`UPDATE materialization_requests SET active_key = NULL WHERE id = ${requestId}`)
    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevice: 1 }),
    )).toBe(1)
    expect(repo.item(earlier)).toBeUndefined()
    expect(repo.item(later)).toBeDefined()
    expect(objectReferences(objectId)).toBe(1)

    expect(await cleanupService.enforceClipboard(cleanupPolicy({ maxAgeMillis: 1 }))).toBeGreaterThanOrEqual(1)
    expect(objectReferences(objectId)).toBe(0)
    expect(sqliteValue(db.all<{ count: number }>(sql`SELECT count(*) AS count FROM representations WHERE item_id IN (${earlier}, ${later})`))[0]?.count).toBe(0)
    expect(repo.changes(channelC, 0, 20).some(({ kind }) => kind === "remove")).toBe(false)
    expect(() => clipboardService.createPublication(deviceA, channelA, {
      id: earlier, createdAt: 1, originDeviceId: deviceA, contents: [], previews: [],
    })).toThrow("ItemId has been removed from the server")
  })

  it("defers pruning items with active uploads", async () => {
    const old = addItem(channelC, deviceC, Date.now() - 10)
    const current = addItem(channelC, deviceC, Date.now())
    const transferId = crypto.randomUUID()
    const uploadId = crypto.randomUUID()
    db.run(sql`INSERT INTO transfers
      (id, device_id, item_id, kind, direction, state, completed_bytes, total_bytes, created_at, updated_at)
      VALUES (${transferId}, ${deviceC}, ${old}, 'content', 'upload', 'queued', 0, 1, 1, 1)`)
    db.run(sql`INSERT INTO uploads
      (id, item_id, channel_id, device_id, transfer_id, kind, state, created_at, expires_at)
      VALUES (${uploadId}, ${old}, ${channelC}, ${deviceC}, ${transferId}, 'materialize', 'open', 1, ${Date.now() + 60_000})`)
    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevice: 1 }),
    )).toBe(0)
    db.run(sql`UPDATE uploads SET state = 'completed' WHERE id = ${uploadId}`)
    expect(await cleanupService.enforceClipboard(
      cleanupPolicy({ maxItemsPerDevice: 1 }),
    )).toBe(1)
    expect(repo.item(old)).toBeUndefined()
    expect(repo.item(current)).toBeDefined()
  })

  it("reclaims server objects only after the last reference has aged past the grace period", async () => {
    const objectId = crypto.randomUUID()
    const sha256 = "b".repeat(64)
    const path = objectStore.path(sha256)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "x")
    db.run(sql`INSERT INTO objects (id, sha256, size, path, ref_count, created_at, unreferenced_at)
      VALUES (${objectId}, ${sha256}, 1, ${path}, 1, 1, NULL)`)
    const id = addItem(channelA, deviceB, Date.now(), objectId, sha256)
    expect(objectCollector.plan().objectCount).toBe(0)
    expect(await objectCollector.collect()).toBe(0)
    expect(existsSync(path)).toBe(true)

    repo.transaction(() => repo.pruneItem(id, Date.now()))
    expect(objectReferences(objectId)).toBe(0)
    expect(objectCollector.plan().objectCount).toBe(0)
    expect(existsSync(path)).toBe(true)
    db.run(sql`UPDATE objects SET unreferenced_at = ${Date.now() - OBJECT_COLLECTION_GRACE_MILLIS - 1}
      WHERE id = ${objectId}`)
    expect(objectCollector.plan().objectCount).toBe(1)
    expect(await objectCollector.collect()).toBe(1)
    expect(existsSync(path)).toBe(false)
    expect(objectReferences(objectId)).toBeUndefined()
  })

  it("does not collect an object still held by an upload", async () => {
    const objectId = crypto.randomUUID()
    const sha256 = "d".repeat(64)
    const path = objectStore.path(sha256)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "x")
    db.run(sql`INSERT INTO objects (id, sha256, size, path, ref_count, created_at, unreferenced_at)
      VALUES (${objectId}, ${sha256}, 1, ${path}, 0, 1, ${Date.now() - OBJECT_COLLECTION_GRACE_MILLIS - 1})`)
    const transferId = crypto.randomUUID()
    const uploadId = crypto.randomUUID()
    db.run(sql`INSERT INTO transfers
      (id, device_id, item_id, kind, direction, state, completed_bytes, total_bytes, created_at, updated_at)
      VALUES (${transferId}, ${deviceB}, 'pending-item', 'publish', 'upload', 'queued', 0, 1, 1, 1)`)
    db.run(sql`INSERT INTO uploads
      (id, item_id, channel_id, device_id, transfer_id, kind, state, created_at, expires_at)
      VALUES (${uploadId}, 'pending-item', ${channelA}, ${deviceB}, ${transferId}, 'publish', 'open', 1, ${Date.now() + 60_000})`)
    db.run(sql`INSERT INTO upload_objects
      (upload_id, object_kind, object_id, expected_size, expected_sha256, mime_type, stored_object_id)
      VALUES (${uploadId}, 'content', 'primary', 1, ${sha256}, 'text/plain', ${objectId})`)

    expect(objectCollector.plan().objectCount).toBe(0)
    expect(await objectCollector.collect()).toBe(0)
    expect(existsSync(path)).toBe(true)
    db.run(sql`DELETE FROM upload_objects WHERE upload_id = ${uploadId}`)
    expect(await objectCollector.collect()).toBe(1)
    expect(existsSync(path)).toBe(false)
  })

  it("drains an object backlog through fixed internal batches", async () => {
    const now = Date.now()
    const paths: string[] = []
    for (let index = 0; index < 51; index += 1) {
      const id = crypto.randomUUID()
      const sha256 = index.toString(16).padStart(64, "0")
      const path = objectStore.path(sha256)
      paths.push(path)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, String(index))
      db.run(sql`INSERT INTO objects (id, sha256, size, path, ref_count, created_at, unreferenced_at)
        VALUES (${id}, ${sha256}, ${String(index).length}, ${path}, 0, 1, ${now - OBJECT_COLLECTION_GRACE_MILLIS - 1})`)
    }
    expect(await objectCollector.collect(now)).toBe(51)
    expect(paths.filter(existsSync)).toHaveLength(0)
  })

  it("does not run cleanup after a publication completes its upload", () => {
    const recent = addItem(channelA, deviceA, Date.now())
    const older = crypto.randomUUID()
    const sweep = spyOn(cleanupService, "sweep")
    try {
      const publication = clipboardService.createPublication(deviceA, channelA, {
        id: older,
        createdAt: 1,
        originDeviceId: deviceA,
        contents: [{ id: "primary", mimeType: "text/plain", size: 1, sha256: "c".repeat(64), delivery: "on-demand" }],
        previews: [],
      })
      expect(publication.transfer.state).toBe("completed")
      expect(clipboardService.completeUpload(publication.uploadId, deviceA).transfer.state).toBe("completed")
      expect(sweep).not.toHaveBeenCalled()
      expect(repo.item(older)).toBeDefined()
      expect(repo.item(recent)).toBeDefined()
    } finally {
      sweep.mockRestore()
    }
  })

  it("expires unfinished work when an item is explicitly deleted", () => {
    const id = addItem(channelA, deviceB, Date.now())
    const transferId = crypto.randomUUID()
    const uploadId = crypto.randomUUID()
    const requestId = crypto.randomUUID()
    db.run(sql`INSERT INTO transfers
      (id, device_id, item_id, kind, direction, state, completed_bytes, total_bytes, created_at, updated_at)
      VALUES (${transferId}, ${deviceB}, ${id}, 'content', 'upload', 'queued', 0, 1, 1, 1)`)
    db.run(sql`INSERT INTO uploads
      (id, item_id, channel_id, device_id, transfer_id, kind, state, created_at, expires_at)
      VALUES (${uploadId}, ${id}, ${channelA}, ${deviceB}, ${transferId}, 'materialize', 'open', 1, ${Date.now() + 60_000})`)
    db.run(sql`INSERT INTO materialization_requests
      (id, active_key, channel_id, item_id, content_id, source_device_id, state, created_at, updated_at, expires_at)
      VALUES (${requestId}, ${id}, ${channelA}, ${id}, 'primary', ${deviceB}, 'waiting-for-peer', 1, 1, ${Date.now() + 60_000})`)

    clipboardService.deleteItem(id)
    expect(sqliteValue(db.all<{ state: string }>(sql`SELECT state FROM transfers WHERE id = ${transferId}`))[0]?.state).toBe("expired")
    expect(sqliteValue(db.all<{ state: string }>(sql`SELECT state FROM uploads WHERE id = ${uploadId}`))[0]?.state).toBe("expired")
    expect(sqliteValue(db.all<{ active_key: string | null }>(sql`
      SELECT active_key FROM materialization_requests WHERE id = ${requestId}
    `))[0]?.active_key).toBeNull()
    expect(() => clipboardService.completeUpload(uploadId, deviceB)).toThrow("Upload session is no longer available")
    expect(() => clipboardService.uploadExpectation(uploadId, "content", "primary", deviceB))
      .toThrow("Upload session is no longer available")
  })

  it("applies the default count and age limits independently to each device in each channel", async () => {
    const firstChannel = crypto.randomUUID()
    const secondChannel = crypto.randomUUID()
    const now = Date.now()
    const day = 86_400_000
    let oldest = ""
    let newest = ""
    let otherDevice = ""
    let otherChannel = ""
    let expired = ""
    repo.transaction(() => {
      for (const id of [firstChannel, secondChannel]) {
        db.run(sql`INSERT INTO channels (id, name, created_at, updated_at) VALUES (${id}, 'Defaults', ${now}, ${now})`)
      }
      for (let index = 0; index < 1001; index += 1) {
        const id = addItem(firstChannel, deviceA, now - day + index)
        if (index === 0) oldest = id
        newest = id
      }
      otherDevice = addItem(firstChannel, deviceB, now - day)
      otherChannel = addItem(secondChannel, deviceA, now - 29 * day)
      expired = addItem(secondChannel, deviceA, now - 31 * day)
    })
    await cleanupService.enforceClipboard(CleanupOptions.parse(undefined))
    expect(repo.item(oldest)).toBeUndefined()
    expect(repo.item(expired)).toBeUndefined()
    expect(repo.item(newest)).toBeDefined()
    expect(repo.item(otherDevice)).toBeDefined()
    expect(repo.item(otherChannel)).toBeDefined()
    expect(sqliteValue(db.all<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM clipboard_items
      WHERE channel_id = ${firstChannel} AND origin_device_id = ${deviceA} AND deleted_at IS NULL
    `))[0]?.count).toBe(1000)
  })

  it("preserves explicit deletion events and allows automatic cleanup to be disabled", async () => {
    expect(await cleanupService.enforceClipboard({ ...config.cleanup, enabled: false })).toBe(0)
    const id = addItem(channelA, deviceA, Date.now())
    repo.transaction(() => repo.deleteItem(repo.item(id)!, Date.now()))
    expect(repo.changes(channelA, 0, 100).at(-1)).toMatchObject({ item_id: id, kind: "remove", reason: "deleted" })
  })
})
