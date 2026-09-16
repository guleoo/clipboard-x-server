import { beforeAll, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { DomainError, type ErrorCode } from "../src/common/error"
import { virtualDevice } from "../src/common/virtual-device"
import { config } from "../src/config"
import { Database } from "../src/db"
import { databaseConfig } from "../src/frame/db"
import { objectStore } from "../src/repo/object"
import { channelService } from "../src/service/channel"
import { clipboardService } from "../src/service/clipboard"
import { deviceService } from "../src/service/device"

const clientDeviceId = crypto.randomUUID()
let channelId = ""

function domainError(action: () => unknown, code: ErrorCode): void {
  try {
    action()
    throw new Error("Expected a DomainError")
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).errorCode).toBe(code)
  }
}

beforeAll(async () => {
  Database.init()
  Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder })
  await objectStore.initialize()
  await deviceService.synchronize()
  channelService.synchronize()
  deviceService.create({ id: clientDeviceId })
  await deviceService.issueKey(clientDeviceId)
  deviceService.updateProfile(clientDeviceId, { tag: "Test laptop", iconKind: "laptop",
    iconColor: { light: "#2190a4", dark: "#183945" } })
  channelId = channelService.create("Test channel").id
  channelService.addMember(channelId, clientDeviceId)
})

describe("virtual device", () => {
  it("is a fixed SQLite device outside the managed YAML configuration", () => {
    expect(config.read().devices.some(({ id }) => id === virtualDevice.id)).toBe(false)
    expect(deviceService.get(virtualDevice.id)).toMatchObject({
      ...virtualDevice,
      kind: "virtual",
      state: "online",
    })
    domainError(() => deviceService.update(virtualDevice.id, { disabled: true }), "virtual_device_immutable")
    domainError(() => deviceService.delete(virtualDevice.id), "virtual_device_immutable")
  })

  it("is an immutable member of every channel without entering channel YAML", () => {
    const channel = channelService.list().find(({ id }) => id === channelId)
    expect(channel?.members.some(({ id, kind }) => id === virtualDevice.id && kind === "virtual")).toBe(true)
    expect(channel?.members.find(({ id }) => id === clientDeviceId)?.iconColor)
      .toEqual({ light: "#2190a4", dark: "#183945" })
    expect(config.read().channels.find(({ id }) => id === channelId)?.members).toEqual([clientDeviceId])
    domainError(
      () => channelService.removeMember(channelId, virtualDevice.id),
      "virtual_device_membership_immutable",
    )
  })

  it("publishes outward through the normal channel feed without receiving that feed", async () => {
    const bytes = new TextEncoder().encode("Shared from the server")
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const itemId = crypto.randomUUID()
    const publication = clipboardService.publishFromVirtualDevice(channelId, {
      id: itemId,
      createdAt: Date.now(),
      contents: [{
        id: "primary",
        mimeType: "text/plain;charset=utf-8",
        size: bytes.byteLength,
        sha256,
        delivery: "eager",
      }],
      previews: [],
    })
    expect(publication.transfer).toMatchObject({
      deviceId: virtualDevice.id,
      peerDeviceIds: [clientDeviceId],
    })

    const expectation = clipboardService.uploadExpectation(
      publication.uploadId,
      "content",
      "primary",
      virtualDevice.id,
    )
    const stored = await objectStore.write(new Blob([bytes]).stream(), {
      size: expectation.expected_size,
      sha256: expectation.expected_sha256,
      maximumBytes: config.maxObjectBytes,
    })
    clipboardService.recordUploadedObject(expectation, stored)
    expect(clipboardService.completeUpload(publication.uploadId, virtualDevice.id).transfer.state).toBe("completed")

    expect(clipboardService.changes(clientDeviceId, channelId, undefined, 20).changes).toEqual([
      expect.objectContaining({ kind: "upsert", itemId }),
    ])
    expect(clipboardService.item(clientDeviceId, channelId, itemId).origin).toMatchObject({
      deviceId: virtualDevice.id,
      iconColor: { light: "#ffffff" },
      kind: "virtual",
    })
    domainError(
      () => clipboardService.changes(virtualDevice.id, channelId, undefined, 20),
      "virtual_device_receive_forbidden",
    )
  })

  it("rejects virtual publications that would require later materialization", () => {
    domainError(() => clipboardService.publishFromVirtualDevice(channelId, {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      contents: [{
        id: "primary",
        mimeType: "text/plain;charset=utf-8",
        size: 1,
        sha256: "0".repeat(64),
        delivery: "on-demand",
      }],
      previews: [],
    }), "invalid_request")
  })
})
