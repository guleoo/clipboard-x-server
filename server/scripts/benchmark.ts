import { mkdtemp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { sql } from "drizzle-orm"
import { Application } from "../src/application"
import { createId } from "../src/common/identity"
import { ConfigurationSchema, ConfigurationStore, loadConfig } from "../src/config"
import { migrateApplicationDatabase } from "../src/db"
import { clipboardItems } from "../src/db/schema"

const loads = {
  publications: 2_000,
  materializations: 200,
  progressUpdates: 100_000,
  metadataItems: 100_000,
  objectBytes: 80 * 1024 * 1024,
} as const

const directory = await mkdtemp("/tmp/clipboard-x-benchmark-")
const configurationPath = join(directory, "config.yaml")
ConfigurationStore.create(configurationPath, ConfigurationSchema.parse({
  version: 1,
  server: { environment: "test", cookieSecure: false },
  storage: {
    dataDirectory: "./data",
    migrationsDirectory: resolve(import.meta.dir, "../drizzle"),
  },
  administrator: { username: "administrator", password: "benchmark-password" },
}))
const config = loadConfig(configurationPath)
migrateApplicationDatabase(config)
const application = await Application.create(config)
const sourceId = "11111111-1111-4111-8111-111111111111"
const targetId = "22222222-2222-4222-8222-222222222222"
const measurements: Record<string, number> = {}

async function measure(name: string, operation: () => void | Promise<void>): Promise<void> {
  const started = performance.now()
  await operation()
  measurements[name] = Math.round((performance.now() - started) * 100) / 100
}

try {
  application.devices.create({ id: sourceId, tag: "Benchmark source", iconKind: "server" })
  application.devices.create({ id: targetId, tag: "Benchmark target", iconKind: "desktop" })
  const channel = application.channels.create("Benchmark")
  application.channels.addMember(channel.id, sourceId)
  application.channels.addMember(channel.id, targetId)

  const publishedIds: string[] = []
  await measure("publicationsMs", () => {
    for (let index = 0; index < loads.publications; index += 1) {
      const id = createId()
      publishedIds.push(id)
      application.clipboard.createPublication(sourceId, channel.id, {
        id,
        createdAt: index + 1,
        originDeviceId: sourceId,
        contents: [{
          id: "content",
          mimeType: "text/plain;charset=utf-8",
          size: 1,
          sha256: index.toString(16).padStart(64, "0"),
          delivery: "on-demand",
        }],
        previews: [],
      })
    }
  })

  await measure("materializationsMs", () => {
    for (const id of publishedIds.slice(0, loads.materializations)) {
      application.clipboard.requestContent({
        requesterKind: "device",
        requesterId: targetId,
        memberDeviceId: targetId,
        channelId: channel.id,
        itemId: id,
        contentId: "content",
      })
    }
  })

  const progress = application.transfers.create({
    deviceId: sourceId,
    itemId: publishedIds[0]!,
    kind: "content",
    direction: "upload",
    state: "queued",
    totalBytes: loads.progressUpdates,
  })
  await measure("progressUpdatesMs", () => {
    for (let value = 1; value <= loads.progressUpdates; value += 1) {
      application.transfers.update(progress.id, value === loads.progressUpdates ? "completed" : "transferring", value)
    }
  })

  await measure("metadataSeedMs", () => {
    application.database.transaction(() => {
      for (let start = loads.publications; start < loads.metadataItems; start += 500) {
        const end = Math.min(start + 500, loads.metadataItems)
        const values = Array.from({ length: end - start }, (_, offset) => {
          const index = start + offset
          return {
            id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
            channelId: channel.id,
            originDeviceId: sourceId,
            createdAt: index + 1,
            updatedAt: index + 1,
            visible: true,
          }
        })
        application.database.current.insert(clipboardItems).values(values).run()
      }
    })
  })
  await measure("metadataFirstPageMs", () => {
    const page = application.clipboard.list({ channelId: channel.id, memberDeviceId: targetId, limit: 100 })
    if (page.items.length !== 100 || !page.hasMore || !page.cursor) throw new Error("Metadata page baseline failed")
  })
  const plan = application.database.current.all<{ detail: string }>(sql`
    EXPLAIN QUERY PLAN SELECT id FROM clipboard_items
    WHERE channel_id = ${channel.id} AND visible = 1 AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT ${101}
  `)
  if (!plan.some((entry) => entry.detail.includes("clipboard_items_page"))) {
    throw new Error(`Pagination did not use clipboard_items_page: ${JSON.stringify(plan)}`)
  }

  const chunk = new Uint8Array(64 * 1024)
  const chunkCount = loads.objectBytes / chunk.byteLength
  const digest = new Bun.CryptoHasher("sha256")
  for (let index = 0; index < chunkCount; index += 1) digest.update(chunk)
  const expectedHash = digest.digest("hex")
  const body = () => new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < chunkCount; index += 1) controller.enqueue(chunk)
      controller.close()
    },
  })
  let storedPath = ""
  await measure("objectUpload80MiBMs", async () => {
    storedPath = (await application.objects.write(body(), {
      size: loads.objectBytes,
      sha256: expectedHash,
      maximumBytes: loads.objectBytes,
    })).path
  })
  await measure("objectDownload80MiBMs", async () => {
    const reader = Bun.file(storedPath).stream().getReader()
    const hash = new Bun.CryptoHasher("sha256")
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      hash.update(part.value)
    }
    if (size !== loads.objectBytes || hash.digest("hex") !== expectedHash) throw new Error("Object download baseline failed")
  })

  console.log(JSON.stringify({ event: "benchmark.complete", loads, measurements, paginationPlan: plan }, null, 2))
} finally {
  application.close()
  await rm(directory, { recursive: true, force: true })
}
