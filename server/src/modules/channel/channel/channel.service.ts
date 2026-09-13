import { DomainError, notFound } from "../../../common/error"
import { createId } from "../../../common/identity"
import type { ChannelConfiguration, ServerConfig } from "../../../config"
import type { ApplicationDatabase } from "../../../db"
import type { Device } from "../../device/device"
import { ChannelRepo, type ChannelRow } from "./channel.repo"

export interface Channel {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly members?: readonly Pick<Device, "id" | "tag" | "iconKind" | "state">[]
}

function channelOf(row: ChannelRow): Channel {
  return { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

export class ChannelService {
  readonly #repo: ChannelRepo

  constructor(
    private readonly database: ApplicationDatabase,
    private readonly config: ServerConfig,
  ) {
    this.#repo = new ChannelRepo(database)
  }

  synchronize(): void {
    const configured = this.config.configuration.read().channels
    const configuredIds = new Set(configured.map(({ id }) => id))
    const now = Date.now()
    this.database.transaction(() => {
      for (const channel of configured) {
        this.#repo.save({ id: channel.id, name: channel.name, now })
        this.#repo.clearMembers(channel.id)
        for (const deviceId of channel.members) this.#repo.addMember(channel.id, deviceId, now)
      }
      for (const id of this.#repo.activeIds()) {
        if (!configuredIds.has(id)) this.#repo.archive(id, now)
      }
    })
  }

  list(): readonly Channel[] {
    const members = this.#repo.memberRows()
    return this.#repo.list().map((row) => ({
      ...channelOf(row),
      members: members.filter((member) => member.channelId === row.id).map((member) => ({
        id: member.id,
        tag: member.tag,
        iconKind: member.iconKind,
        state: member.disabledAt ? "disabled" : member.state,
      })),
    }))
  }

  listForDevice(deviceId: string): readonly Channel[] {
    return this.#repo.listForDevice(deviceId).map(channelOf)
  }

  create(name: string): Channel {
    const id = createId()
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => configuration.channels.push({ id, name, members: [] }),
      () => this.#repo.create(id, name, now),
    )
    return this.get(id)
  }

  update(id: string, name: string): Channel {
    this.config.configuration.change(
      (configuration) => {
        this.configuredChannel(configuration.channels, id).name = name
      },
      () => {
        if (this.#repo.update(id, name, Date.now()) === 0) throw notFound("Channel not found")
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
      () => this.database.transaction(() => {
        if (this.#repo.softDelete(id, now) === 0 && !this.#repo.exists(id)) throw notFound("Channel not found")
        this.#repo.clearMembers(id)
      }),
    )
  }

  addMember(channelId: string, deviceId: string): void {
    this.get(channelId)
    if (!this.#repo.activeDeviceExists(deviceId)) throw notFound("Device not found")
    this.config.configuration.change(
      (configuration) => {
        const channel = this.configuredChannel(configuration.channels, channelId)
        if (!channel.members.includes(deviceId)) channel.members.push(deviceId)
      },
      () => this.#repo.addMember(channelId, deviceId, Date.now()),
    )
  }

  removeMember(channelId: string, deviceId: string): void {
    this.get(channelId)
    this.config.configuration.change(
      (configuration) => {
        const channel = this.configuredChannel(configuration.channels, channelId)
        channel.members = channel.members.filter((member) => member !== deviceId)
      },
      () => this.#repo.removeMember(channelId, deviceId),
    )
  }

  requireMember(channelId: string, deviceId: string): void {
    if (!this.#repo.isMember(channelId, deviceId)) {
      throw new DomainError("channel_forbidden", "Device is not a member of this channel", 403)
    }
  }

  private get(id: string): Channel {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Channel not found")
    return channelOf(row)
  }

  private configuredChannel(values: ChannelConfiguration[], id: string): ChannelConfiguration {
    const channel = values.find((candidate) => candidate.id === id)
    if (!channel) throw notFound("Channel not found in configuration")
    return channel
  }
}
