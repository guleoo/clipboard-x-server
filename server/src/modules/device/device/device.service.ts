import { DomainError, notFound } from "../../../common/error"
import { createId, createSecret, digestSecret, isUuidV4, secretsEqual } from "../../../common/identity"
import { deviceKeyId, deviceKeySecret, type DeviceConfiguration, type ServerConfig } from "../../../config"
import type { ApplicationDatabase } from "../../../db"
import { Password } from "../../../frame/security/password"
import { DeviceRepo, type DeviceKeyRow, type DeviceRow } from "./device.repo"

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
}

export interface DeviceKeySummary {
  readonly id: string
  readonly createdAt: number
  readonly expiresAt?: number
  readonly revokedAt?: number
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
  return {
    id: row.id,
    tag: row.tag,
    iconKind: row.iconKind,
    state: row.deletedAt ? "unavailable" : row.disabledAt ? "disabled" : recentlySeen ? "online" : "offline",
    lastSeenAt: row.lastSeenAt,
    ...(row.disabledAt ? { disabledAt: row.disabledAt } : {}),
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
  readonly #repo: DeviceRepo
  readonly #verifiedKeys = new Map<string, { readonly secretDigest: string; readonly secretHash: string }>()

  constructor(
    private readonly database: ApplicationDatabase,
    private readonly config: ServerConfig,
  ) {
    this.#repo = new DeviceRepo(database)
  }

  async synchronize(): Promise<void> {
    const configured = this.config.configuration.read().devices
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
    const configuredDeviceIds = new Set(configured.map(({ id }) => id))
    const configuredKeyIds = new Set(keys.map(({ id }) => id))
    this.database.transaction(() => {
      for (const device of configured) {
        this.#repo.synchronizeDevice({
          id: device.id,
          tag: device.tag,
          iconKind: device.iconKind,
          disabledAt: device.disabled ? now : null,
          now,
        })
        if (device.disabled) this.#repo.revokeDeviceKeys(device.id, now)
      }
      for (const id of this.#repo.deviceIds()) {
        if (!configuredDeviceIds.has(id)) this.#repo.archive(id, now)
      }
      for (const key of keys) this.#repo.saveKey({ ...key, secretHash: key.hash })
      for (const id of this.#repo.activeKeyIds()) {
        if (!configuredKeyIds.has(id)) this.#repo.revokeKey(id, now)
      }
    })
    this.#verifiedKeys.clear()
  }

  list(includeDeleted = false): readonly (Device & { readonly keys: readonly DeviceKeySummary[] })[] {
    const keys = this.#repo.keys()
    return this.#repo.list(includeDeleted).map((row) => ({
      ...deviceOf(row),
      keys: keys.filter((key) => key.deviceId === row.id).map(keyOf),
    }))
  }

  get(id: string): Device {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Device not found")
    return deviceOf(row)
  }

  create(input: { readonly id: string; readonly tag: string; readonly iconKind: DeviceConfiguration["iconKind"] }): Device {
    if (!isUuidV4(input.id)) throw new DomainError("invalid_request", "DeviceId must be a UUID v4", 400)
    if (this.config.configuration.read().devices.some((device) => device.id === input.id)) {
      throw new DomainError("invalid_request", "Device already exists", 409)
    }
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => configuration.devices.push({ ...input, disabled: false, keys: [] }),
      () => this.#repo.saveDevice({ ...input, now }),
    )
    return this.get(input.id)
  }

  update(id: string, input: {
    readonly tag?: string | undefined
    readonly iconKind?: DeviceConfiguration["iconKind"] | undefined
    readonly disabled?: boolean | undefined
  }): Device {
    const current = this.get(id)
    if (current.deletedAt) throw notFound("Device not found")
    const now = Date.now()
    const disabledAt = input.disabled === undefined ? current.disabledAt ?? null : input.disabled ? now : null
    this.config.configuration.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, id)
        device.tag = input.tag ?? current.tag
        device.iconKind = input.iconKind ?? current.iconKind as DeviceConfiguration["iconKind"]
        if (input.disabled !== undefined) device.disabled = input.disabled
        if (input.disabled) device.keys = []
      },
      () => this.database.transaction(() => {
        this.#repo.updateProfile(id, {
          tag: input.tag ?? current.tag,
          iconKind: input.iconKind ?? current.iconKind,
          disabledAt,
          updatedAt: now,
        })
        if (input.disabled) this.#repo.revokeDeviceKeys(id, now)
      }),
    )
    return this.get(id)
  }

  updateProfile(id: string, input: { readonly tag: string; readonly iconKind: DeviceConfiguration["iconKind"] }): Device {
    const current = this.get(id)
    if (current.disabledAt || current.deletedAt) throw new DomainError("device_disabled", "Device is disabled", 403)
    this.config.configuration.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, id)
        device.tag = input.tag
        device.iconKind = input.iconKind
      },
      () => this.#repo.updateProfile(id, { ...input, updatedAt: Date.now() }),
    )
    return this.get(id)
  }

  delete(id: string): void {
    const current = this.get(id)
    if (current.deletedAt) return
    this.config.configuration.change(
      (configuration) => {
        configuration.devices = configuration.devices.filter((device) => device.id !== id)
        for (const channel of configuration.channels) {
          channel.members = channel.members.filter((deviceId) => deviceId !== id)
        }
      },
      () => this.database.transaction(() => this.#repo.delete(id, Date.now())),
    )
  }

  async issueKey(deviceId: string): Promise<IssuedDeviceKey> {
    const device = this.get(deviceId)
    if (device.deletedAt) throw notFound("Device not found")
    if (device.disabledAt) throw new DomainError("device_disabled", "Device is disabled", 409)
    const id = createId()
    const secret = createSecret()
    const key = `cbx_${id}_${secret}`
    const hash = await this.hash(secret)
    const now = Date.now()
    const overlapExpiresAt = now + this.config.keyOverlapMs
    this.config.configuration.change(
      (configuration) => {
        const configured = this.configuredDevice(configuration.devices, deviceId)
        for (const configuredKey of configured.keys) {
          if (configuredKey.expiresAt === undefined || configuredKey.expiresAt > overlapExpiresAt) {
            configuredKey.expiresAt = overlapExpiresAt
          }
        }
        configured.keys.push({ value: key, createdAt: now })
      },
      () => this.database.transaction(() => {
        this.#repo.overlapActiveKeys(deviceId, overlapExpiresAt)
        this.#repo.insertKey({ id, deviceId, secretHash: hash, createdAt: now })
      }),
    )
    return { id, key, createdAt: now }
  }

  revokeKey(deviceId: string, keyId: string): void {
    this.config.configuration.change(
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

  async authenticate(apiKey: string | undefined, claimedDeviceId: string | undefined): Promise<DeviceIdentity> {
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
    if (row.deviceId !== claimedDeviceId) {
      throw new DomainError("device_mismatch", "API key does not belong to the claimed DeviceId", 403)
    }
    this.#repo.touch(row.deviceId, now)
    return { deviceId: row.deviceId, keyId: row.id }
  }

  private configuredDevice(devices: DeviceConfiguration[], id: string): DeviceConfiguration {
    const device = devices.find((candidate) => candidate.id === id)
    if (!device) throw notFound("Device not found in configuration")
    return device
  }

  private hash(secret: string): Promise<string> {
    return Password.hash(secret, {
      memoryCost: this.config.passwordMemoryCost,
      timeCost: this.config.passwordTimeCost,
    })
  }
}
