import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"
import { isVirtualDevice, virtualDevice } from "../common/virtual-device"
import { config, type ChannelConfiguration } from "../config"
import { db } from "../db"
import { ChannelRepo, type ChannelRow } from "../repo/channel"
import type { Device } from "./device"

export interface Channel {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ManagedChannel extends Channel {
  readonly members: readonly Pick<Device, "id" | "tag" | "iconKind" | "iconColor" | "state" | "kind">[]
}

function channelOf(row: ChannelRow): Channel {
  return { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

export class ChannelService {
  readonly #repo = new ChannelRepo()

  synchronize(): void {
    const configured = config.read().channels
    const configuredIds = new Set(configured.map(({ id }) => id))
    const now = Date.now()
    db.transaction(() => {
      for (const channel of configured) {
        this.#repo.save({ id: channel.id, name: channel.name, now })
        this.#repo.clearMembers(channel.id)
        for (const deviceId of channel.members) this.#repo.addMember(channel.id, deviceId, now)
        this.#repo.addMember(channel.id, virtualDevice.id, now)
      }
      for (const id of this.#repo.activeIds()) {
        if (!configuredIds.has(id)) this.#repo.archive(id, now)
      }
    })
  }

  list(): readonly ManagedChannel[] {
    const members = this.#repo.memberRows()
    return this.#repo.list().map((row) => this.withMembers(row, members))
  }

  listForDevice(deviceId: string): readonly Channel[] {
    return this.#repo.listForDevice(deviceId).map(channelOf)
  }

  create(name: string): ManagedChannel {
    const id = createId()
    const now = Date.now()
    config.change(
      (configuration) => configuration.channels.push({ id, name, members: [] }),
      () => db.transaction(() => {
        this.#repo.create(id, name, now)
        this.#repo.addMember(id, virtualDevice.id, now)
      }),
    )
    return this.getWithMembers(id)
  }

  update(id: string, name: string): ManagedChannel {
    config.change(
      (configuration) => {
        this.configuredChannel(configuration.channels, id).name = name
      },
      () => {
        if (this.#repo.update(id, name, Date.now()) === 0) throw notFound("Channel not found")
      },
    )
    return this.getWithMembers(id)
  }

  delete(id: string): void {
    const now = Date.now()
    config.change(
      (configuration) => {
        this.configuredChannel(configuration.channels, id)
        configuration.channels = configuration.channels.filter((channel) => channel.id !== id)
      },
      () => db.transaction(() => {
        if (this.#repo.softDelete(id, now) === 0 && !this.#repo.exists(id)) throw notFound("Channel not found")
        this.#repo.clearMembers(id)
      }),
    )
  }

  addMember(channelId: string, deviceId: string): void {
    this.requireMutableMember(deviceId)
    this.get(channelId)
    if (!this.#repo.activeDeviceExists(deviceId)) throw notFound("Device not found")
    config.change(
      (configuration) => {
        const channel = this.configuredChannel(configuration.channels, channelId)
        if (!channel.members.includes(deviceId)) channel.members.push(deviceId)
      },
      () => this.#repo.addMember(channelId, deviceId, Date.now()),
    )
  }

  removeMember(channelId: string, deviceId: string): void {
    this.requireMutableMember(deviceId)
    this.get(channelId)
    config.change(
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

  requireReceiver(channelId: string, deviceId: string): void {
    this.requireMember(channelId, deviceId)
    if (isVirtualDevice(deviceId)) {
      throw new DomainError("virtual_device_receive_forbidden", "Virtual device does not receive channel content", 403)
    }
  }

  recipients(channelId: string, sourceDeviceId: string): readonly string[] {
    this.requireMember(channelId, sourceDeviceId)
    return this.#repo.memberIds(channelId).filter((id) => id !== sourceDeviceId && !isVirtualDevice(id))
  }

  private get(id: string): Channel {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Channel not found")
    return channelOf(row)
  }

  private getWithMembers(id: string): ManagedChannel {
    const row = this.#repo.get(id)
    if (!row) throw notFound("Channel not found")
    return this.withMembers(row, this.#repo.memberRows())
  }

  private withMembers(row: ChannelRow, members: ReturnType<ChannelRepo["memberRows"]>): ManagedChannel {
    return {
      ...channelOf(row),
      members: members.filter((member) => member.channelId === row.id).map((member) => ({
        id: member.id,
        tag: member.tag,
        iconKind: member.iconKind,
        iconColor: {
          light: member.iconColorLight,
          ...(member.iconColorDark ? { dark: member.iconColorDark } : {}),
        },
        state: isVirtualDevice(member.id) ? "online" : member.disabledAt ? "disabled" : member.state,
        kind: isVirtualDevice(member.id) ? "virtual" : "client",
      })),
    }
  }

  private requireMutableMember(deviceId: string): void {
    if (isVirtualDevice(deviceId)) {
      throw new DomainError("virtual_device_membership_immutable", "Virtual device membership cannot be modified", 409)
    }
  }

  private configuredChannel(values: ChannelConfiguration[], id: string): ChannelConfiguration {
    const channel = values.find((candidate) => candidate.id === id)
    if (!channel) throw notFound("Channel not found in configuration")
    return channel
  }
}

export const channelService = new ChannelService()
