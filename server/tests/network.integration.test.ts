import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { Application } from "../src/application"
import { createHttpApp } from "../src/http/app"
import { createTestConfig } from "./support"

const runNetworkTests = Bun.env.CLIPBOARD_X_NETWORK_TEST === "1"
const describeNetwork = runNetworkTests ? describe : describe.skip
const directory = runNetworkTests ? await mkdtemp("/tmp/clipboard-x-network-") : ""
let application: Application | undefined
let server: Bun.Server<unknown> | undefined

afterAll(async () => {
  server?.stop(true)
  application?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describeNetwork("real Bun listener", () => {
  test("streams authenticated uploads and downloads through Fetch", async () => {
    const sourceId = "11111111-1111-4111-8111-111111111111"
    const targetId = "22222222-2222-4222-8222-222222222222"
    const itemId = "33333333-3333-4333-8333-333333333333"
    application = await Application.create(createTestConfig(directory))
    application.devices.create({ id: sourceId, tag: "Source", iconKind: "desktop" })
    application.devices.create({ id: targetId, tag: "Target", iconKind: "laptop" })
    const sourceKey = await application.devices.issueKey(sourceId)
    const targetKey = await application.devices.issueKey(targetId)
    const channel = application.channels.create("Network")
    application.channels.addMember(channel.id, sourceId)
    application.channels.addMember(channel.id, targetId)
    const bytes = new TextEncoder().encode("real listener streamed bytes")
    const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    const publication = application.clipboard.createPublication(sourceId, channel.id, {
      id: itemId,
      createdAt: Date.now(),
      originDeviceId: sourceId,
      contents: [{ id: "plain", mimeType: "text/plain;charset=utf-8", size: bytes.byteLength, sha256: digest, delivery: "eager" }],
      previews: [],
    })
    const app = createHttpApp(application)
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch })
    const headers = (deviceId: string, key: string) => ({
      Authorization: `Bearer ${key}`,
      "X-Clipboard-X-Device-Id": deviceId,
    })
    const uploaded = await fetch(new URL(`/api/v1/uploads/${publication.uploadId}/contents/plain`, server.url), {
      method: "PUT",
      headers: { ...headers(sourceId, sourceKey.key), "Content-Type": "text/plain;charset=utf-8", "Content-Length": String(bytes.byteLength) },
      body: bytes,
    })
    expect(uploaded.status).toBe(200)
    const completed = await fetch(new URL(`/api/v1/uploads/${publication.uploadId}/complete`, server.url), {
      method: "POST",
      headers: { ...headers(sourceId, sourceKey.key), "Content-Type": "application/json" },
      body: "{}",
    })
    expect(completed.status).toBe(200)
    const downloaded = await fetch(new URL(
      `/api/v1/channels/${channel.id}/items/${itemId}/contents/plain`,
      server.url,
    ), { headers: headers(targetId, targetKey.key) })
    expect(downloaded.headers.get("content-length")).toBe(String(bytes.byteLength))
    expect(downloaded.headers.get("x-content-sha256")).toBe(digest)
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes)
  }, 30_000)
})
