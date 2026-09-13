import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { sql } from "drizzle-orm"
import { Application } from "../src/application"
import { createHttpApp } from "../src/http/app"
import { createTestConfig } from "./support"

const origin = "http://localhost"
const sourceId = "11111111-1111-4111-8111-111111111111"
const targetId = "22222222-2222-4222-8222-222222222222"
const outsiderId = "33333333-3333-4333-8333-333333333333"
const itemId = "44444444-4444-4444-8444-444444444444"
const badItemId = "55555555-5555-4555-8555-555555555555"

interface Fixture {
  readonly application: Application
  readonly app: ReturnType<typeof createHttpApp>
  readonly directory: string
}

const fixtures: Fixture[] = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.application.close()
    await rm(fixture.directory, { recursive: true, force: true })
  }
})

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp("/tmp/clipboard-x-http-")
  const application = await Application.create(createTestConfig(directory))
  const value = { application, app: createHttpApp(application), directory }
  fixtures.push(value)
  return value
}

async function document<Value>(response: Response): Promise<Value> {
  const body = await response.json()
  return body as Value
}

function jsonRequest(method: string, body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body),
  }
}

function deviceHeaders(deviceId: string, key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "X-Clipboard-X-Device-Id": deviceId }
}

async function initializeAdmin(app: Fixture["app"], password = "1234567"): Promise<string> {
  const response = await app.request("/admin/api/v1/session", jsonRequest("POST", {
    username: "administrator",
    password,
  }))
  expect(response.status).toBe(200)
  const cookie = response.headers.get("set-cookie")?.split(";")[0]
  expect(cookie).toStartWith("clipboard_x_admin=")
  return cookie ?? ""
}

async function adminRequest(
  app: Fixture["app"],
  cookie: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  if (body === undefined) return app.request(path, { method, headers: { Cookie: cookie, Origin: origin } })
  return app.request(path, jsonRequest(method, body, { Cookie: cookie }))
}

async function createDevice(app: Fixture["app"], cookie: string, id: string, tag: string): Promise<string> {
  const created = await adminRequest(app, cookie, "/admin/api/v1/devices", "POST", {
    id,
    tag,
    iconKind: "laptop",
  })
  expect(created.status).toBe(201)
  const issued = await adminRequest(app, cookie, `/admin/api/v1/devices/${id}/keys`, "POST", {})
  expect(issued.status).toBe(201)
  return (await document<{ key: string }>(issued)).key
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function upload(
  app: Fixture["app"],
  path: string,
  deviceId: string,
  key: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<Response> {
  return app.request(path, {
    method: "PUT",
    headers: { ...deviceHeaders(deviceId, key), "Content-Type": mimeType, "Content-Length": String(bytes.byteLength) },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  })
}

describe("HTTP API v1", () => {
  test("configured single administrator, session and same-origin protection", async () => {
    const { app } = await fixture()
    expect((await app.request("/health/live")).status).toBe(200)
    expect((await app.request("/health/ready")).status).toBe(200)

    const noOrigin = await app.request("/admin/api/v1/session", jsonRequest("POST", {
      username: "administrator",
      password: "1234567",
    }, { Origin: "https://attacker.invalid" }))
    expect(noOrigin.status).toBe(403)

    const shortPassword = await app.request("/admin/api/v1/session", jsonRequest("POST", {
      username: "administrator",
      password: "123456",
    }))
    expect(shortPassword.status).toBe(400)
    expect((await document<{ error: { code: string } }>(shortPassword)).error.code).toBe("invalid_request")

    const cookie = await initializeAdmin(app, "1234567")
    const session = await app.request("/admin/api/v1/session", { headers: { Cookie: cookie } })
    expect(session.status).toBe(200)
    expect((await document<{ administrator: { id: number } }>(session)).administrator.id).toBe(1)

    const updated = await adminRequest(app, cookie, "/admin/api/v1/administrator", "PATCH", {
      username: "renamed-administrator",
      password: "another password",
    })
    expect(updated.status).toBe(204)
    expect((await app.request("/admin/api/v1/session", { headers: { Cookie: cookie } })).status).toBe(401)
    expect((await app.request("/admin/api/v1/session", jsonRequest("POST", {
      username: "renamed-administrator",
      password: "another password",
    }))).status).toBe(200)
  })

  test("device binding, channel authorization, eager publication and on-demand materialization", async () => {
    const { app, application } = await fixture()
    const cookie = await initializeAdmin(app)
    const sourceKey = await createDevice(app, cookie, sourceId, "Source")
    const targetKey = await createDevice(app, cookie, targetId, "Target")
    const outsiderKey = await createDevice(app, cookie, outsiderId, "Outsider")

    const channelResponse = await adminRequest(app, cookie, "/admin/api/v1/channels", "POST", { name: "Home" })
    const channel = await document<{ id: string }>(channelResponse)
    for (const deviceId of [sourceId, targetId]) {
      expect((await adminRequest(
        app,
        cookie,
        `/admin/api/v1/channels/${channel.id}/members/${deviceId}`,
        "PUT",
      )).status).toBe(204)
    }

    const mismatch = await app.request("/api/v1/status", { headers: deviceHeaders(targetId, sourceKey) })
    expect(mismatch.status).toBe(403)
    expect((await document<{ error: { code: string } }>(mismatch)).error.code).toBe("device_mismatch")
    expect((await app.request("/api/v1/status", { headers: deviceHeaders(sourceId, sourceKey) })).status).toBe(200)
    const forbidden = await app.request(`/api/v1/channels/${channel.id}/changes`, {
      headers: deviceHeaders(outsiderId, outsiderKey),
    })
    expect(forbidden.status).toBe(403)
    expect((await document<{ error: { code: string } }>(forbidden)).error.code).toBe("channel_forbidden")

    const eager = new TextEncoder().encode("small synchronized text")
    const preview = new TextEncoder().encode("large preview")
    const lazy = new TextEncoder().encode("large content materialized on demand")
    const publicationResponse = await app.request(`/api/v1/channels/${channel.id}/items`, jsonRequest("POST", {
      id: itemId,
      createdAt: Date.now(),
      originDeviceId: sourceId,
      contents: [
        { id: "plain", mimeType: "text/plain;charset=utf-8", size: eager.byteLength, sha256: sha256(eager), delivery: "eager" },
        { id: "original", mimeType: "text/plain;charset=utf-8", size: lazy.byteLength, sha256: sha256(lazy), delivery: "on-demand" },
      ],
      previews: [
        { id: "summary", contentId: "original", mimeType: "text/plain;charset=utf-8", size: preview.byteLength, sha256: sha256(preview), truncated: true },
      ],
    }, deviceHeaders(sourceId, sourceKey)))
    expect(publicationResponse.status).toBe(201)
    const publication = await document<{ uploadId: string; transfer: { totalBytes: number } }>(publicationResponse)
    expect(publication.transfer.totalBytes).toBe(eager.byteLength + preview.byteLength)
    expect((await upload(app, `/api/v1/uploads/${publication.uploadId}/previews/summary`, sourceId, sourceKey, "text/plain;charset=utf-8", preview)).status).toBe(200)
    expect((await upload(app, `/api/v1/uploads/${publication.uploadId}/contents/plain`, sourceId, sourceKey, "text/plain;charset=utf-8", eager)).status).toBe(200)
    const completed = await app.request(`/api/v1/uploads/${publication.uploadId}/complete`, jsonRequest("POST", {}, deviceHeaders(sourceId, sourceKey)))
    expect((await document<{ transfer: { state: string; completedBytes: number } }>(completed)).transfer)
      .toMatchObject({ state: "completed", completedBytes: eager.byteLength + preview.byteLength })

    const changes = await document<{ cursor: string; hasMore: boolean; changes: readonly { sequence: number; kind: string; itemId: string; reason: string }[] }>(
      await app.request(`/api/v1/channels/${channel.id}/changes?limit=1`, { headers: deviceHeaders(targetId, targetKey) }),
    )
    expect(changes.cursor.length).toBeGreaterThan(0)
    expect(changes.changes).toEqual([{ sequence: 1, kind: "upsert", itemId, reason: "" }])
    const item = await document<{ contents: readonly { id: string; availability: string }[] }>(
      await app.request(`/api/v1/channels/${channel.id}/items/${itemId}`, { headers: deviceHeaders(targetId, targetKey) }),
    )
    expect(item.contents.find((value) => value.id === "plain")?.availability).toBe("available")
    expect(item.contents.find((value) => value.id === "original")?.availability).toBe("source-required")
    const previewDownload = await app.request(
      `/api/v1/channels/${channel.id}/items/${itemId}/previews/summary`,
      { headers: deviceHeaders(targetId, targetKey) },
    )
    expect(new Uint8Array(await previewDownload.arrayBuffer())).toEqual(preview)

    const requested = await document<{ transfer: { id: string; state: string } }>(await app.request(
      `/api/v1/channels/${channel.id}/items/${itemId}/contents/original/requests`,
      jsonRequest("POST", {}, deviceHeaders(targetId, targetKey)),
    ))
    expect(requested.transfer.state).toBe("waiting-for-peer")
    const adminRequested = await document<{ transfer: { id: string } }>(await adminRequest(
      app,
      cookie,
      `/admin/api/v1/items/${itemId}/contents/original/requests`,
      "POST",
      {},
    ))
    expect(adminRequested.transfer.id).not.toBe(requested.transfer.id)
    expect(application.database.first<{ count: number }>(sql`SELECT count(*) AS count FROM work_queue`)?.count).toBe(1)

    const workPage = await document<{ work: readonly { id: string }[] }>(
      await app.request("/api/v1/work", { headers: deviceHeaders(sourceId, sourceKey) }),
    )
    expect(workPage.work).toHaveLength(1)
    const accepted = await document<{ uploadId: string; transfer: { id: string } }>(await app.request(
      `/api/v1/work/${workPage.work[0]!.id}/accept`,
      jsonRequest("POST", {}, deviceHeaders(sourceId, sourceKey)),
    ))
    const expectation = application.clipboard.uploadExpectation(accepted.uploadId, "content", "original", sourceId)
    application.clipboard.progressUpload(expectation, Math.floor(lazy.byteLength / 2))
    expect(application.transfers.get(requested.transfer.id).state).toBe("transferring")
    expect(application.transfers.get(requested.transfer.id).completedBytes).toBe(Math.floor(lazy.byteLength / 2))

    expect((await upload(
      app,
      `/api/v1/uploads/${accepted.uploadId}/contents/original`,
      sourceId,
      sourceKey,
      "text/plain;charset=utf-8",
      lazy,
    )).status).toBe(200)
    expect((await app.request(
      `/api/v1/uploads/${accepted.uploadId}/complete`,
      jsonRequest("POST", {}, deviceHeaders(sourceId, sourceKey)),
    )).status).toBe(200)
    expect(application.transfers.get(requested.transfer.id).state).toBe("completed")
    expect(application.transfers.get(adminRequested.transfer.id).state).toBe("completed")
    const lazyDownload = await app.request(
      `/api/v1/channels/${channel.id}/items/${itemId}/contents/original`,
      { headers: deviceHeaders(targetId, targetKey) },
    )
    expect(lazyDownload.headers.get("x-content-sha256")).toBe(sha256(lazy))
    expect(new Uint8Array(await lazyDownload.arrayBuffer())).toEqual(lazy)

    const cached = await document<{ transfer: { state: string } }>(await app.request(
      `/api/v1/channels/${channel.id}/items/${itemId}/contents/original/requests`,
      jsonRequest("POST", {}, deviceHeaders(targetId, targetKey)),
    ))
    expect(cached.transfer.state).toBe("completed")
    expect(application.database.first<{ count: number }>(sql`SELECT count(*) AS count FROM work_queue`)?.count).toBe(1)

    const manifestOnly = {
      id: badItemId,
      createdAt: Date.now() + 1,
      originDeviceId: sourceId,
      contents: [{ id: "deferred", mimeType: "text/html", size: 100, sha256: "a".repeat(64), delivery: "on-demand" }],
      previews: [],
    }
    const manifestOnlyResponse = await app.request(
      `/api/v1/channels/${channel.id}/items`,
      jsonRequest("POST", manifestOnly, deviceHeaders(sourceId, sourceKey)),
    )
    expect((await document<{ transfer: { state: string } }>(manifestOnlyResponse)).transfer.state).toBe("completed")
    const idempotent = await app.request(
      `/api/v1/channels/${channel.id}/items`,
      jsonRequest("POST", manifestOnly, deviceHeaders(sourceId, sourceKey)),
    )
    expect((await document<{ transfer: { state: string } }>(idempotent)).transfer.state).toBe("completed")

    const firstPage = await document<{ items: readonly { id: string }[]; cursor: string; hasMore: boolean }>(
      await app.request(`/api/v1/channels/${channel.id}/items?limit=1`, { headers: deviceHeaders(targetId, targetKey) }),
    )
    expect(firstPage.hasMore).toBeTrue()
    const secondPage = await document<{ items: readonly { id: string }[]; hasMore: boolean }>(
      await app.request(`/api/v1/channels/${channel.id}/items?limit=1&cursor=${encodeURIComponent(firstPage.cursor)}`, {
        headers: deviceHeaders(targetId, targetKey),
      }),
    )
    expect(new Set([...firstPage.items, ...secondPage.items].map((value) => value.id))).toEqual(new Set([itemId, badItemId]))
    expect(secondPage.hasMore).toBeFalse()
    const mimeFiltered = await document<{ items: readonly { id: string }[] }>(await adminRequest(
      app,
      cookie,
      "/admin/api/v1/items?mimeType=text%2F",
    ))
    expect(mimeFiltered.items).toHaveLength(2)
  }, 30_000)

  test("hash mismatch leaves an incomplete item invisible and JSON limits are enforced", async () => {
    const { app } = await fixture()
    const cookie = await initializeAdmin(app)
    const key = await createDevice(app, cookie, sourceId, "Source")
    const channel = await document<{ id: string }>(await adminRequest(app, cookie, "/admin/api/v1/channels", "POST", { name: "Private" }))
    await adminRequest(app, cookie, `/admin/api/v1/channels/${channel.id}/members/${sourceId}`, "PUT")
    const expected = new TextEncoder().encode("expected")
    const publication = await document<{ uploadId: string }>(await app.request(
      `/api/v1/channels/${channel.id}/items`,
      jsonRequest("POST", {
        id: badItemId,
        createdAt: Date.now(),
        originDeviceId: sourceId,
        contents: [{ id: "plain", mimeType: "text/plain;charset=utf-8", size: expected.byteLength, sha256: sha256(expected), delivery: "eager" }],
        previews: [],
      }, deviceHeaders(sourceId, key)),
    ))
    const mismatch = await upload(
      app,
      `/api/v1/uploads/${publication.uploadId}/contents/plain`,
      sourceId,
      key,
      "text/plain;charset=utf-8",
      new TextEncoder().encode("mismatch"),
    )
    expect(mismatch.status).toBe(422)
    expect((await document<{ error: { code: string } }>(mismatch)).error.code).toBe("hash_mismatch")
    const list = await document<{ items: readonly unknown[] }>(
      await app.request(`/api/v1/channels/${channel.id}/items`, { headers: deviceHeaders(sourceId, key) }),
    )
    expect(list.items).toHaveLength(0)

    const oversizedBody = JSON.stringify({ value: "x".repeat(300 * 1024) })
    const oversized = await app.request("/admin/api/v1/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: oversizedBody,
    })
    expect(oversized.status).toBe(413)
    expect((await document<{ error: { code: string } }>(oversized)).error.code).toBe("too_large")
  }, 30_000)
})
