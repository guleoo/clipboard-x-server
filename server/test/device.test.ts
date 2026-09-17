import { beforeAll, describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { config } from "../src/config"
import { Database } from "../src/db"
import { databaseConfig } from "../src/frame/db"
import { deviceService } from "../src/service/device"
import { DeviceProfileSchema } from "../src/dto/device"

beforeAll(async () => {
  Database.init()
  Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder })
  await deviceService.synchronize()
})

function configurationDevice(deviceId: string): Record<string, unknown> | undefined {
  const configuration = parse(readFileSync(config.path, "utf8")) as {
    readonly devices: readonly Record<string, unknown>[]
  }
  return configuration.devices.find((device) => device.id === deviceId)
}

describe("pre-registered devices with client-owned profiles", () => {
  it("binds a key to the registered DeviceId and stores synchronized profile fields only in SQLite", async () => {
    const deviceId = crypto.randomUUID()
    const created = deviceService.create({ id: deviceId })

    expect(created).toMatchObject({
      id: deviceId,
      tag: "Waiting for device profile",
      iconKind: "other",
      iconColor: { light: "#ffffff" },
      keys: [],
    })
    expect(configurationDevice(deviceId)).toEqual({
      id: deviceId,
      disabled: false,
      keys: [],
    })

    const issued = await deviceService.issueKey(deviceId)
    await expect(deviceService.authenticate(issued.key, deviceId)).resolves.toEqual({
      deviceId,
      keyId: issued.id,
    })
    await expect(deviceService.authenticate(issued.key, crypto.randomUUID())).rejects.toMatchObject({
      errorCode: "device_mismatch",
      status: 403,
    })

    const updated = deviceService.updateProfile(deviceId, {
      tag: "Client laptop",
      iconKind: "laptop",
      iconColor: { light: "#2190a4", dark: "#183945" },
    })
    expect(updated).toMatchObject({ id: deviceId, tag: "Client laptop", iconKind: "laptop",
      iconColor: { light: "#2190a4", dark: "#183945" } })
    expect(configurationDevice(deviceId)).not.toHaveProperty("tag")
    expect(configurationDevice(deviceId)).not.toHaveProperty("icon-kind")

    await deviceService.synchronize()
    expect(deviceService.get(deviceId)).toMatchObject({
      id: deviceId,
      tag: "Client laptop",
      iconKind: "laptop",
      iconColor: { light: "#2190a4", dark: "#183945" },
    })
  })

  it("defaults a missing icon color to white and rejects invalid colors", () => {
    const deviceId = crypto.randomUUID()
    deviceService.create({ id: deviceId })
    expect(deviceService.updateProfile(deviceId, { tag: "Laptop", iconKind: "laptop" }).iconColor).toEqual({ light: "#ffffff" })
    expect(DeviceProfileSchema.safeParse({ tag: "Laptop", iconKind: "laptop" }).success).toBe(true)
    expect(DeviceProfileSchema.safeParse({ tag: "Laptop", iconKind: "laptop", iconColor: "red" }).success).toBe(false)
    expect(DeviceProfileSchema.safeParse({ tag: "Laptop", iconKind: "laptop", iconColor: { dark: "#123456" } }).success).toBe(false)
    expect(DeviceProfileSchema.safeParse({ tag: "Laptop", iconKind: "laptop", iconColor: { light: "red" } }).success).toBe(false)
    expect(DeviceProfileSchema.parse({ tag: "Laptop", iconKind: "laptop", iconColor: { light: "#ffffff" } }).iconColor)
      .toEqual({ light: "#ffffff" })
    expect(deviceService.updateProfile(deviceId, { tag: "Laptop", iconKind: "laptop",
      iconColor: { light: "#db9421", dark: "#734210" } }).iconColor)
      .toEqual({ light: "#db9421", dark: "#734210" })
    expect(deviceService.updateProfile(deviceId, { tag: "Laptop", iconKind: "laptop",
      iconColor: { light: "#db9421" } }).iconColor).toEqual({ light: "#db9421" })
  })

  it("stores arbitrary icon identifiers without prescribing a client's icon library", async () => {
    const deviceId = crypto.randomUUID()
    deviceService.create({ id: deviceId })
    const profile = { tag: "Arch workstation", iconKind: "archlinux" }
    expect(DeviceProfileSchema.safeParse(profile).success).toBe(true)
    expect(deviceService.updateProfile(deviceId, profile).iconKind).toBe("archlinux")
    await deviceService.synchronize()
    expect(deviceService.get(deviceId).iconKind).toBe("archlinux")
    expect(DeviceProfileSchema.safeParse({ ...profile, iconKind: "future-os" }).success).toBe(true)
    for (const iconKind of ["", "x".repeat(129), "bad\nvalue", "bad\0value"]) {
      expect(DeviceProfileSchema.safeParse({ ...profile, iconKind }).success).toBe(false)
    }
  })

  it("rejects issuing a key before its DeviceId is registered", async () => {
    await expect(deviceService.issueKey(crypto.randomUUID())).rejects.toMatchObject({
      errorCode: "not_found",
      status: 404,
    })
  })
})
