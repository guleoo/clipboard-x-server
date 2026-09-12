import type { Database } from "bun:sqlite"
import { DomainError, notFound } from "../common/error"
import { createId, createSecret, digestSecret, isUuidV4, secretsEqual } from "../common/identity"
import { deviceKeyId, deviceKeySecret, type DeviceConfiguration, type ServerConfig } from "../entry/config"

interface DeviceRow {
  readonly id: string
  readonly tag: string
  readonly icon_kind: string
  readonly state: string
  readonly last_seen_at: number
  readonly disabled_at: number | null
  readonly deleted_at: number | null
  readonly created_at: number
  readonly updated_at: number
}

interface DeviceKeyRow {
  readonly id: string
  readonly device_id: string
  readonly secret_hash: string
  readonly created_at: number
  readonly expires_at: number | null
  readonly revoked_at: number | null
}

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
  const recentlySeen = row.last_seen_at > 0 && Date.now() - row.last_seen_at <= onlineWindowMs
  return {
    id: row.id,
    tag: row.tag,
    iconKind: row.icon_kind,
    state: row.deleted_at ? "unavailable" : row.disabled_at ? "disabled" : recentlySeen ? "online" : "offline",
    lastSeenAt: row.last_seen_at,
    ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function keyOf(row: DeviceKeyRow): DeviceKeySummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  }
}

export class DevicesService {
  private readonly verifiedKeys = new Map<string, { readonly secretDigest: string; readonly secretHash: string }>()

  constructor(
    private readonly database: Database,
    private readonly config: ServerConfig,
  ) {}

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
        const current = this.database.query<{ secret_hash: string }, [string]>(
          "SELECT secret_hash FROM device_keys WHERE id = ?",
        ).get(id)
        const matches = current
          ? await Bun.password.verify(secret, current.secret_hash).catch(() => false)
          : false
        keys.push({
          deviceId: device.id,
          id,
          hash: matches ? current!.secret_hash : await Bun.password.hash(secret, { algorithm: "argon2id", memoryCost: 65_536, timeCost: 3 }),
          createdAt: key.createdAt ?? now,
          expiresAt: key.expiresAt ?? null,
        })
      }
    }
    const configuredDeviceIds = new Set(configured.map((device) => device.id))
    const configuredKeyIds = new Set(keys.map((key) => key.id))
    this.database.transaction(() => {
      for (const device of configured) this.synchronizeDevice(device, now)
      for (const row of this.database.query<{ id: string }, []>("SELECT id FROM devices").all()) {
        if (configuredDeviceIds.has(row.id)) continue
        this.database.query(
          `UPDATE devices SET state = 'unavailable', disabled_at = COALESCE(disabled_at, ?),
             deleted_at = COALESCE(deleted_at, ?), updated_at = ? WHERE id = ?`,
        ).run(now, now, now, row.id)
        this.database.query("UPDATE device_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE device_id = ?").run(now, row.id)
        this.database.query("DELETE FROM channel_members WHERE device_id = ?").run(row.id)
      }
      for (const key of keys) {
        this.database.query(
          `INSERT INTO device_keys(id, device_id, secret_hash, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET device_id = excluded.device_id,
             secret_hash = excluded.secret_hash, expires_at = excluded.expires_at, revoked_at = NULL`,
        ).run(key.id, key.deviceId, key.hash, key.createdAt, key.expiresAt)
      }
      for (const row of this.database.query<{ id: string }, []>("SELECT id FROM device_keys WHERE revoked_at IS NULL").all()) {
        if (!configuredKeyIds.has(row.id)) {
          this.database.query("UPDATE device_keys SET revoked_at = ? WHERE id = ?").run(now, row.id)
        }
      }
    })()
    this.verifiedKeys.clear()
  }

  list(includeDeleted = false): readonly (Device & { readonly keys: readonly DeviceKeySummary[] })[] {
    const rows = this.database.query<DeviceRow, []>(
      `SELECT * FROM devices ${includeDeleted ? "" : "WHERE deleted_at IS NULL"} ORDER BY created_at DESC`,
    ).all()
    const keys = this.database.query<DeviceKeyRow, []>("SELECT * FROM device_keys ORDER BY created_at DESC").all()
    return rows.map((row) => ({
      ...deviceOf(row),
      keys: keys.filter((key) => key.device_id === row.id).map(keyOf),
    }))
  }

  get(id: string): Device {
    const row = this.database.query<DeviceRow, [string]>("SELECT * FROM devices WHERE id = ?").get(id)
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
      (configuration) => {
        configuration.devices.push({ ...input, disabled: false, keys: [] })
      },
      () => {
        this.database.query(
          `INSERT INTO devices(id, tag, icon_kind, state, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, 'offline', 0, ?, ?)
           ON CONFLICT(id) DO UPDATE SET tag = excluded.tag, icon_kind = excluded.icon_kind,
             state = 'offline', disabled_at = NULL, deleted_at = NULL, updated_at = excluded.updated_at`,
        ).run(input.id, input.tag, input.iconKind, now, now)
      },
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
    const disabledAt = input.disabled === undefined
      ? current.disabledAt ?? null
      : input.disabled ? now : null
    this.config.configuration.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, id)
        device.tag = input.tag ?? current.tag
        device.iconKind = input.iconKind ?? current.iconKind as DeviceConfiguration["iconKind"]
        if (input.disabled !== undefined) device.disabled = input.disabled
        if (input.disabled) device.keys = []
      },
      () => {
        this.database.transaction(() => {
          this.database.query(
            "UPDATE devices SET tag = ?, icon_kind = ?, disabled_at = ?, updated_at = ? WHERE id = ?",
          ).run(input.tag ?? current.tag, input.iconKind ?? current.iconKind, disabledAt, now, id)
          if (input.disabled) {
            this.database.query("UPDATE device_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE device_id = ?").run(now, id)
          }
        })()
      },
    )
    return this.get(id)
  }

  updateProfile(id: string, input: { readonly tag: string; readonly iconKind: DeviceConfiguration["iconKind"] }): Device {
    const current = this.get(id)
    if (current.disabledAt || current.deletedAt) throw new DomainError("device_disabled", "Device is disabled", 403)
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, id)
        device.tag = input.tag
        device.iconKind = input.iconKind
      },
      () => {
        this.database.query("UPDATE devices SET tag = ?, icon_kind = ?, updated_at = ? WHERE id = ?")
          .run(input.tag, input.iconKind, now, id)
      },
    )
    return this.get(id)
  }

  delete(id: string): void {
    const current = this.get(id)
    if (current.deletedAt) return
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => {
        configuration.devices = configuration.devices.filter((device) => device.id !== id)
        for (const channel of configuration.channels) {
          channel.members = channel.members.filter((deviceId) => deviceId !== id)
        }
      },
      () => {
        this.database.transaction(() => {
          this.database.query(
            "UPDATE devices SET state = 'unavailable', disabled_at = COALESCE(disabled_at, ?), deleted_at = ?, updated_at = ? WHERE id = ?",
          ).run(now, now, now, id)
          this.database.query("UPDATE device_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE device_id = ?").run(now, id)
          this.database.query("DELETE FROM channel_members WHERE device_id = ?").run(id)
        })()
      },
    )
  }

  async issueKey(deviceId: string): Promise<IssuedDeviceKey> {
    const device = this.get(deviceId)
    if (device.deletedAt) throw notFound("Device not found")
    if (device.disabledAt) throw new DomainError("device_disabled", "Device is disabled", 409)
    const id = createId()
    const secret = createSecret()
    const key = `cbx_${id}_${secret}`
    const hash = await Bun.password.hash(secret, { algorithm: "argon2id", memoryCost: 65_536, timeCost: 3 })
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
      () => {
        this.database.transaction(() => {
          this.database.query(
            `UPDATE device_keys SET expires_at = CASE
               WHEN expires_at IS NULL OR expires_at > ? THEN ? ELSE expires_at END
             WHERE device_id = ? AND revoked_at IS NULL`,
          ).run(overlapExpiresAt, overlapExpiresAt, deviceId)
          this.database.query(
            "INSERT INTO device_keys(id, device_id, secret_hash, created_at) VALUES (?, ?, ?, ?)",
          ).run(id, deviceId, hash, now)
        })()
      },
    )
    return { id, key, createdAt: now }
  }

  revokeKey(deviceId: string, keyId: string): void {
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => {
        const device = this.configuredDevice(configuration.devices, deviceId)
        device.keys = device.keys.filter((key) => deviceKeyId(key.value) !== keyId)
      },
      () => {
        const result = this.database.query(
          "UPDATE device_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND device_id = ?",
        ).run(now, keyId, deviceId)
        if (result.changes === 0) throw notFound("Device key not found")
      },
    )
    this.verifiedKeys.delete(keyId)
  }

  async authenticate(apiKey: string | undefined, claimedDeviceId: string | undefined): Promise<DeviceIdentity> {
    if (!apiKey?.startsWith("cbx_")) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    const separator = apiKey.indexOf("_", 4)
    if (separator < 0) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    const keyId = apiKey.slice(4, separator)
    const secret = apiKey.slice(separator + 1)
    const now = Date.now()
    const row = this.database.query<DeviceKeyRow & Pick<DeviceRow, "disabled_at" | "deleted_at">, [string, number]>(
      `SELECT k.*, d.disabled_at, d.deleted_at
       FROM device_keys k JOIN devices d ON d.id = k.device_id
       WHERE k.id = ? AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > ?)`,
    ).get(keyId, now)
    const secretDigest = digestSecret(secret)
    const cached = row ? this.verifiedKeys.get(row.id) : undefined
    const valid = cached !== undefined && cached.secretHash === row?.secret_hash && secretsEqual(secretDigest, cached.secretDigest)
      ? true
      : await Bun.password.verify(secret, row?.secret_hash ?? fallbackHash).catch(() => false)
    if (!row || !valid) throw new DomainError("invalid_key", "Device API key is invalid", 401)
    this.verifiedKeys.set(row.id, { secretDigest, secretHash: row.secret_hash })
    if (row.disabled_at || row.deleted_at) throw new DomainError("device_disabled", "Device is disabled", 403)
    if (row.device_id !== claimedDeviceId) {
      throw new DomainError("device_mismatch", "API key does not belong to the claimed DeviceId", 403)
    }
    this.touch(row.device_id, now)
    return { deviceId: row.device_id, keyId: row.id }
  }

  private touch(deviceId: string, now: number): void {
    this.database.query(
      `UPDATE devices SET state = 'online', last_seen_at = ?, updated_at = ?
       WHERE id = ? AND (? - last_seen_at >= 30000)`,
    ).run(now, now, deviceId, now)
  }

  private synchronizeDevice(device: DeviceConfiguration, now: number): void {
    this.database.query(
      `INSERT INTO devices(id, tag, icon_kind, state, last_seen_at, disabled_at, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'offline', 0, ?, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET tag = excluded.tag, icon_kind = excluded.icon_kind,
         disabled_at = excluded.disabled_at, deleted_at = NULL, updated_at = excluded.updated_at`,
    ).run(device.id, device.tag, device.iconKind, device.disabled ? now : null, now, now)
    if (device.disabled) {
      this.database.query("UPDATE device_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE device_id = ?").run(now, device.id)
    }
  }

  private configuredDevice(devices: DeviceConfiguration[], id: string): DeviceConfiguration {
    const device = devices.find((candidate) => candidate.id === id)
    if (!device) throw notFound("Device not found in configuration")
    return device
  }
}
