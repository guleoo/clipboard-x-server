import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { Application } from "../src/application"
import { Cursor } from "../src/common/cursor"
import { createTestConfig } from "./support"

const applications: { application: Application; directory: string }[] = []

afterEach(async () => {
  for (const current of applications.splice(0)) {
    current.application.close()
    await rm(current.directory, { recursive: true, force: true })
  }
})

async function application(): Promise<Application> {
  const directory = await mkdtemp("/tmp/clipboard-x-domain-")
  const value = await Application.create(createTestConfig(directory))
  applications.push({ application: value, directory })
  return value
}

describe("domain invariants", () => {
  test("cursor is opaque, versioned and rejects tampering", () => {
    const cursor = Cursor.encode(42)
    expect(cursor).not.toBe("42")
    expect(Cursor.decode(cursor)).toBe(42)
    expect(() => Cursor.decode("not-a-cursor")).toThrow()
  })

  test("transfer progress is monotonic and terminal states do not regress", async () => {
    const value = await application()
    const deviceId = "11111111-1111-4111-8111-111111111111"
    value.devices.create({ id: deviceId, tag: "Test", iconKind: "desktop" })
    const transfer = value.transfers.create({
      deviceId,
      itemId: "22222222-2222-4222-8222-222222222222",
      kind: "publish",
      direction: "upload",
      state: "queued",
      totalBytes: 100,
    })
    expect(value.transfers.update(transfer.id, "transferring", 40).completedBytes).toBe(40)
    expect(() => value.transfers.update(transfer.id, "transferring", 39)).toThrow("monotonic")
    expect(() => value.transfers.update(transfer.id, "completed", 99)).toThrow("totalBytes")
    expect(value.transfers.update(transfer.id, "completed", 100).state).toBe("completed")
    expect(value.transfers.cancel(transfer.id).state).toBe("completed")
  })

  test("device key rotation overlaps briefly and revocation is immediate", async () => {
    const value = await application()
    const deviceId = "11111111-1111-4111-8111-111111111111"
    value.devices.create({ id: deviceId, tag: "Test", iconKind: "desktop" })
    const first = await value.devices.issueKey(deviceId)
    const second = await value.devices.issueKey(deviceId)
    const stored = value.database.raw.query<{ secret_hash: string }, [string]>(
      "SELECT secret_hash FROM device_keys WHERE id = ?",
    ).get(second.id)
    expect(stored?.secret_hash).toStartWith("$argon2id$")
    expect(stored?.secret_hash).not.toContain(second.key)
    expect((await value.devices.authenticate(first.key, deviceId)).keyId).toBe(first.id)
    expect((await value.devices.authenticate(second.key, deviceId)).keyId).toBe(second.id)
    expect((await value.devices.authenticate(second.key, deviceId)).keyId).toBe(second.id)
    value.devices.revokeKey(deviceId, first.id)
    await expect(value.devices.authenticate(first.key, deviceId)).rejects.toMatchObject({ code: "invalid_key" })
    await expect(value.devices.authenticate(second.key, "22222222-2222-4222-8222-222222222222"))
      .rejects.toMatchObject({ code: "device_mismatch" })
  }, 30_000)
})
