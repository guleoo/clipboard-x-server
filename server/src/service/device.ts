import { DomainError, notFound } from "../common/error"
import { createId, createSecret, digestSecret, isUuidV4, secretsEqual } from "../common/identity"
import { isVirtualDevice, virtualDevice } from "../common/virtual-device"
import { config, deviceKeyId, deviceKeySecret, type DeviceConfiguration } from "../config"
import { db } from "../db"
import { Password } from "../frame/security/password"
import { DeviceRepo, type DeviceKeyRow, type DeviceRow } from "../repo/device"

export interface Device {
  readonly id: string
  readonly tag: string
  readonly iconKind: string
  readonly state: string
  readonly lastSeenAt: number
  readonly disabledAt?: number
  readonly deletedAt?: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly kind: "client" | "virtual"
}

export interface DeviceKeySummary {
  readonly id: string
  readonly createdAt: number
  readonly expiresAt?: number
  readonly revokedAt?: number
}

export interface ManagedDevice extends Device {
  readonly keys: readonly DeviceKeySummary[]
}

export interface IssuedDeviceKey extends DeviceKeySummary {
  readonly key: string
}

export interface DeviceIdentity {
  readonly deviceId: string
  readonly keyId: string
}

const onlineWindowMs = 2 * 60 * 1000
const fallbackHash = "$argon2id$v=19$m=65536,t=3,p=1$sitgAOVTqhqcM/yU/ZD1M/bZiL9QFG9owjlvOcfV7sI$fSZBewiKp8+gWiRTdYm2IdOPM5cPfY8kUVgISh5eMco"

function deviceOf(row: DeviceRow): Device {
  const recentlySeen = row.lastSeenAt > 0 && Date.now() - row.lastSeenAt <= onlineWindowMs
  const virtual = isVirtualDevice(row.id)
  return {
    id: row.id,
    tag: row.tag,
    iconKind: row.iconKind,
    state: virtual ? "online" : row.deletedAt ? "unavailable" : row.disabledAt ? "disabled" : recentlySeen ? "online" : "offline",
    lastSeenAt: row.lastSeenAt,
    ...(row.disabledAt ? { disabledAt: row.disabledAt } : {}),
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    kind: virtual ? "virtual" : "client",
  }
}

function keyOf(row: DeviceKeyRow): DeviceKeySummary {
  return {
    id: row.id,
    createdAt: row.createdAt,
    ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
  }
}

export class DeviceService {
  readonly #repo = new DeviceRepo()
  readonly #verifiedKeys = new Map<string, { readonly secretDigest: string; readonly secretHash: string }>()

  async synchronize(): Promise<void> {
    const configured = config.read().devices
    const now = Date.now()
    const keys: Array<{
      readonly deviceId: string
      readonly id: string
      readonly hash: string
      readonly createdAt: number
      readonly expiresAt: number | null
    }> = []
    for (const device of configured) {
      for (const key of device.keys) {
        const id = deviceKeyId(key.value)
        const secret = deviceKeySecret(key.value)
        const currentHash = this.#repo.secretHash(id)
        const matches = currentHash ? await Password.verify(secret, currentHash) : false
        keys.push({
          deviceId: device.id,
          id,
          hash: matches ? currentHash! : await this.hash(secret),
          createdAt: key.createdAt ?? now,
          expiresAt: key.expiresAt ?? null,
        })
      }
    }
    const configuredDeviceIds = new Set([virtualDevice.id, ...configured.map(({ id }) => id)])
    const configuredKeyIds = new Set(keys.map(({ id }) => id))
    db.transaction(() => {
      this.#repo.synchronizeVirtualDevice(now)
      for (const device of configured) {
        this.#repo.synchronizeDevice({
          id: device.id,
          disabledAt: device.disabled ? now : null,
          now,
        })
      }
      for (const id of this.#repo.deviceIds()) {
        if (!configuredDeviceIds.has(id)) this.#repo.archive(id, now)
      }
      for (const key of keys) this.#repo.saveKey({ ...key, secretHash: key.hash })
      for (const device of configured) {
        if (device.disabled) this.#repo.revokeDeviceKeys(device.id, now)
      }
      for (const id of this.#repo.activeKeyIds()) {
        if (!configuredKeyIds.has(id)) this.#repo.revokeKey(id, now)
      }
    })
    this.#verifiedKeys.clear()
  }

  list(includeDeleted = false): readonly ManagedDevice[] {
    const keys = this.#repo.keys()
    return this.#repo.list(includeDeleted).map((row) => this.withKeys(row, keys))
  }

  get(id: string): Device {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Device not found")
    return deviceOf(row)
  }

  create(input: { readonly id: string }): ManagedDevice {
    if (!isUuidV4(input.id)) throw new DomainError("invalid_request", "DeviceId must be a UUID v4", 400)
    this.requireMutable(input.id)
    if (config.read().devices.some((device) => device.id === input.id)) {
      throw new DomainError("invalid_request", "Device already exists", 409)
    }
    const now = Date.now()
    config.change(
      (configuration) => configuration.devices.push({ id: input.id, disabled: false, keys: [] }),
      () => this.#repo.synchronizeDevice({ id: input.id, disabledAt: null, now }),
    )
    return this.getWithKeys(input.id)
  }

  update(id: string, input: { readonly disabled: boolean }): ManagedDevice {
    this.requireMutable(id)
    const current = this.get(id)
    if (current.deletedAt) throw notFound("Device not found")
    const now = Date.now()
    const disabledAt = input.disabled ? now : null
    config.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, id)
        device.disabled = input.disabled
        if (input.disabled) device.keys = []
      },
      () => db.transaction(() => {
        this.#repo.updateProfile(id, {
          tag: current.tag,
          iconKind: current.iconKind,
          disabledAt,
          updatedAt: now,
        })
        if (input.disabled) this.#repo.revokeDeviceKeys(id, now)
      }),
    )
    return this.getWithKeys(id)
  }

  updateProfile(id: string, input: { readonly tag: string; readonly iconKind: string }): Device {
    this.requireMutable(id)
    const current = this.get(id)
    if (current.disabledAt || current.deletedAt) throw new DomainError("device_disabled", "Device is disabled", 403)
    this.#repo.updateProfile(id, { ...input, updatedAt: Date.now() })
    return this.get(id)
  }

  delete(id: string): void {
    this.requireMutable(id)
    const current = this.get(id)
    if (current.deletedAt) return
    config.change(
      (configuration) => {
        configuration.devices = configuration.devices.filter((device) => device.id !== id)
        for (const channel of configuration.channels) {
          channel.members = channel.members.filter((deviceId) => deviceId !== id)
        }
      },
      () => db.transaction(() => this.#repo.delete(id, Date.now())),
    )
  }

  async issueKey(deviceId: string): Promise<IssuedDeviceKey> {
    this.requireMutable(deviceId)
    const device = this.get(deviceId)
    if (device.deletedAt) throw notFound("Device not found")
    if (device.disabledAt) throw new DomainError("device_disabled", "Device is disabled", 409)
    const id = createId()
    const secret = createSecret()
    const key = `cbx_${id}_${secret}`
    const hash = await this.hash(secret)
    const now = Date.now()
    const overlapExpiresAt = now + config.keyOverlapMillis
    config.change(
      (configuration) => {
        const configured = this.configuredDevice(configuration.devices, deviceId)
        for (const configuredKey of configured.keys) {
          if (configuredKey.expiresAt === undefined || configuredKey.expiresAt > overlapExpiresAt) {
            configuredKey.expiresAt = overlapExpiresAt
          }
        }
        configured.keys.push({ value: key, createdAt: now })
      },
      () => db.transaction(() => {
        this.#repo.overlapActiveKeys(deviceId, overlapExpiresAt)
        this.#repo.insertKey({ id, deviceId, secretHash: hash, createdAt: now })
      }),
    )
    return { id, key, createdAt: now }
  }

  revokeKey(deviceId: string, keyId: string): void {
    this.requireMutable(deviceId)
    config.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, deviceId)
        device.keys = device.keys.filter((key) => deviceKeyId(key.value) !== keyId)
      },
      () => {
        if (this.#repo.revokeOwnedKey(deviceId, keyId, Date.now()) === 0) throw notFound("Device key not found")
      },
    )
    this.#verifiedKeys.delete(keyId)
  }

  async authenticate(apiKey: string | undefined, claimedDeviceId?: string): Promise<DeviceIdentity> {
    if (!apiKey?.startsWith("cbx_")) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    const separator = apiKey.indexOf("_", 4)
    if (separator < 0) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    const keyId = apiKey.slice(4, separator)
    const secret = apiKey.slice(separator + 1)
    const now = Date.now()
    const row = this.#repo.activeAuthenticationKey(keyId, now)
    const secretDigest = digestSecret(secret)
    const cached = row ? this.#verifiedKeys.get(row.id) : undefined
    const valid = cached && cached.secretHash === row?.secretHash && secretsEqual(secretDigest, cached.secretDigest)
      ? true
      : await Password.verify(secret, row?.secretHash ?? fallbackHash)
    if (!row || !valid) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    this.#verifiedKeys.set(row.id, { secretDigest, secretHash: row.secretHash })
    if (row.disabledAt || row.deletedAt) throw new DomainError("device_disabled", "Device is disabled", 403)
    if (claimedDeviceId && row.deviceId !== claimedDeviceId) {
      throw new DomainError("device_mismatch", "API key does not belong to the claimed DeviceId", 403)
    }
    this.#repo.touch(row.deviceId, now)
    return { deviceId: row.deviceId, keyId: row.id }
  }

  private getWithKeys(id: string): ManagedDevice {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Device not found")
    return this.withKeys(row, this.#repo.keys())
  }

  private withKeys(row: DeviceRow, keys: readonly DeviceKeyRow[]): ManagedDevice {
    return {
      ...deviceOf(row),
      keys: keys.filter((key) => key.deviceId === row.id).map(keyOf),
    }
  }

  private requireMutable(id: string): void {
    if (isVirtualDevice(id)) {
      throw new DomainError("virtual_device_immutable", "Virtual device cannot be modified", 409)
    }
  }

  private configuredDevice(devices: DeviceConfiguration[], id: string): DeviceConfiguration {
    const device = devices.find((candidate) => candidate.id === id)
    if (!device) throw notFound("Device not found in configuration")
    return device
  }

  private hash(secret: string): Promise<string> {
    return Password.hash(secret)
  }
}

export const deviceService = new DeviceService()
