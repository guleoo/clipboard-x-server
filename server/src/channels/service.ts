import type { Database } from "bun:sqlite"
import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"
import type { Device } from "../devices/service"
import type { ChannelConfiguration, ServerConfig } from "../entry/config"

interface ChannelRow {
  readonly id: string
  readonly name: string
  readonly created_at: number
  readonly updated_at: number
  readonly deleted_at: number | null
}

export interface Channel {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly members?: readonly Pick<Device, "id" | "tag" | "iconKind" | "state">[]
}

function channelOf(row: ChannelRow): Channel {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

export class ChannelsService {
  constructor(
    private readonly database: Database,
    private readonly config: ServerConfig,
  ) {}

  synchronize(): void {
    const configured = this.config.configuration.read().channels
    const configuredIds = new Set(configured.map((channel) => channel.id))
    const now = Date.now()
    this.database.transaction(() => {
      for (const channel of configured) {
        this.database.query(
          `INSERT INTO channels(id, name, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, deleted_at = NULL`,
        ).run(channel.id, channel.name, now, now)
        this.database.query("DELETE FROM channel_members WHERE channel_id = ?").run(channel.id)
        for (const deviceId of channel.members) {
          this.database.query(
            "INSERT INTO channel_members(channel_id, device_id, joined_at) VALUES (?, ?, ?)",
          ).run(channel.id, deviceId, now)
        }
      }
      for (const row of this.database.query<{ id: string }, []>("SELECT id FROM channels WHERE deleted_at IS NULL").all()) {
        if (configuredIds.has(row.id)) continue
        this.database.query("UPDATE channels SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.id)
        this.database.query("DELETE FROM channel_members WHERE channel_id = ?").run(row.id)
      }
    })()
  }

  list(): readonly Channel[] {
    const channels = this.database.query<ChannelRow, []>(
      "SELECT * FROM channels WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id",
    ).all()
    const members = this.database.query<{
      channel_id: string
      id: string
      tag: string
      icon_kind: string
      state: string
      disabled_at: number | null
    }, []>(
      `SELECT m.channel_id, d.id, d.tag, d.icon_kind, d.state, d.disabled_at
       FROM channel_members m JOIN devices d ON d.id = m.device_id
       WHERE d.deleted_at IS NULL ORDER BY d.tag COLLATE NOCASE`,
    ).all()
    return channels.map((row) => ({
      ...channelOf(row),
      members: members.filter((member) => member.channel_id === row.id).map((member) => ({
        id: member.id,
        tag: member.tag,
        iconKind: member.icon_kind,
        state: member.disabled_at ? "disabled" : member.state,
      })),
    }))
  }

  listForDevice(deviceId: string): readonly Channel[] {
    return this.database.query<ChannelRow, [string]>(
      `SELECT c.* FROM channels c JOIN channel_members m ON m.channel_id = c.id
       WHERE m.device_id = ? AND c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE, c.id`,
    ).all(deviceId).map(channelOf)
  }

  create(name: string): Channel {
    const id = createId()
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => configuration.channels.push({ id, name, members: [] }),
      () => {
        this.database.query("INSERT INTO channels(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
          .run(id, name, now, now)
      },
    )
    return this.get(id)
  }

  update(id: string, name: string): Channel {
    this.config.configuration.change(
      (configuration) => {
        this.configuredChannel(configuration.channels, id).name = name
      },
      () => {
        const result = this.database.query(
          "UPDATE channels SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        ).run(name, Date.now(), id)
        if (result.changes === 0) throw notFound("Channel not found")
      },
    )
    return this.get(id)
  }

  delete(id: string): void {
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => {
        this.configuredChannel(configuration.channels, id)
        configuration.channels = configuration.channels.filter((channel) => channel.id !== id)
      },
      () => {
        this.database.transaction(() => {
          const result = this.database.query(
            "UPDATE channels SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
          ).run(now, now, id)
          if (result.changes === 0 && !this.exists(id)) throw notFound("Channel not found")
          this.database.query("DELETE FROM channel_members WHERE channel_id = ?").run(id)
        })()
      },
    )
  }

  addMember(channelId: string, deviceId: string): void {
    this.get(channelId)
    const device = this.database.query<{ id: string }, [string]>(
      "SELECT id FROM devices WHERE id = ? AND deleted_at IS NULL",
    ).get(deviceId)
    if (!device) throw notFound("Device not found")
    this.config.configuration.change(
      (configuration) => {
        const channel = this.configuredChannel(configuration.channels, channelId)
        if (!channel.members.includes(deviceId)) channel.members.push(deviceId)
      },
      () => {
        this.database.query(
          "INSERT OR IGNORE INTO channel_members(channel_id, device_id, joined_at) VALUES (?, ?, ?)",
        ).run(channelId, deviceId, Date.now())
      },
    )
  }

  removeMember(channelId: string, deviceId: string): void {
    this.get(channelId)
    this.config.configuration.change(
      (configuration) => {
        const channel = this.configuredChannel(configuration.channels, channelId)
        channel.members = channel.members.filter((member) => member !== deviceId)
      },
      () => {
        this.database.query("DELETE FROM channel_members WHERE channel_id = ? AND device_id = ?")
          .run(channelId, deviceId)
      },
    )
  }

  requireMember(channelId: string, deviceId: string): void {
    const row = this.database.query(
      `SELECT 1 FROM channel_members m JOIN channels c ON c.id = m.channel_id
       WHERE m.channel_id = ? AND m.device_id = ? AND c.deleted_at IS NULL`,
    ).get(channelId, deviceId)
    if (!row) throw new DomainError("channel_forbidden", "Device is not a member of this channel", 403)
  }

  private get(id: string): Channel {
    const row = this.database.query<ChannelRow, [string]>(
      "SELECT * FROM channels WHERE id = ? AND deleted_at IS NULL",
    ).get(id)
    if (!row) throw notFound("Channel not found")
    return channelOf(row)
  }

  private exists(id: string): boolean {
    return Boolean(this.database.query("SELECT 1 FROM channels WHERE id = ?").get(id))
  }

  private configuredChannel(channels: ChannelConfiguration[], id: string): ChannelConfiguration {
    const channel = channels.find((candidate) => candidate.id === id)
    if (!channel) throw notFound("Channel not found in configuration")
    return channel
  }
}
