import type { Client as RequestClient } from "@/frame/request"
import { endpoints } from "./endpoints"
import type { Device } from "./schemas"

export class Client {
  static create(request: RequestClient): Client { return new Client(request) }

  readonly session
  readonly login
  readonly logout
  readonly updateAdministrator
  readonly overview
  readonly devices
  readonly createDevice
  readonly updateDevice
  readonly deleteDevice
  readonly issueDeviceKey
  readonly revokeDeviceKey
  readonly channels
  readonly createChannel
  readonly updateChannel
  readonly deleteChannel
  readonly addChannelMember
  readonly removeChannelMember
  readonly items
  readonly item
  readonly deleteItem
  readonly requestContent
  readonly preview
  readonly content
  readonly transfers
  readonly transfer
  readonly cancelTransfer

  private constructor(request: RequestClient) {
    const session = request.bind(endpoints.session)
    const login = request.bind(endpoints.login)
    const logout = request.bind(endpoints.logout)
    const administratorUpdate = request.bind(endpoints.administratorUpdate)
    const overview = request.bind(endpoints.overview)
    const devices = request.bind(endpoints.devices)
    const deviceCreate = request.bind(endpoints.deviceCreate)
    const deviceUpdate = request.bind(endpoints.deviceUpdate)
    const deviceDelete = request.bind(endpoints.deviceDelete)
    const deviceKeyIssue = request.bind(endpoints.deviceKeyIssue)
    const deviceKeyRevoke = request.bind(endpoints.deviceKeyRevoke)
    const channels = request.bind(endpoints.channels)
    const channelCreate = request.bind(endpoints.channelCreate)
    const channelUpdate = request.bind(endpoints.channelUpdate)
    const channelDelete = request.bind(endpoints.channelDelete)
    const channelMemberAdd = request.bind(endpoints.channelMemberAdd)
    const channelMemberRemove = request.bind(endpoints.channelMemberRemove)
    const items = request.bind(endpoints.items)
    const item = request.bind(endpoints.item)
    const itemDelete = request.bind(endpoints.itemDelete)
    const contentRequest = request.bind(endpoints.contentRequest)
    const preview = request.bind(endpoints.preview)
    const content = request.bind(endpoints.content)
    const transfers = request.bind(endpoints.transfers)
    const transfer = request.bind(endpoints.transfer)
    const transferCancel = request.bind(endpoints.transferCancel)

    this.session = () => session({})
    this.login = (input: { readonly username: string; readonly password: string }) => login({ body: input })
    this.logout = () => logout({})
    this.updateAdministrator = (input: { readonly username: string; readonly password: string }) => administratorUpdate({ body: input })
    this.overview = () => overview({})
    this.devices = () => devices({})
    this.createDevice = (input: Pick<Device, "id" | "tag" | "iconKind">) => deviceCreate({ body: input })
    this.updateDevice = (id: string, input: { readonly tag?: string; readonly iconKind?: string; readonly disabled?: boolean }) => deviceUpdate({ path: { id }, body: input })
    this.deleteDevice = (id: string) => deviceDelete({ path: { id } })
    this.issueDeviceKey = (id: string) => deviceKeyIssue({ path: { id }, body: {} })
    this.revokeDeviceKey = (deviceId: string, keyId: string) => deviceKeyRevoke({ path: { deviceId, keyId } })
    this.channels = () => channels({})
    this.createChannel = (name: string) => channelCreate({ body: { name } })
    this.updateChannel = (id: string, name: string) => channelUpdate({ path: { id }, body: { name } })
    this.deleteChannel = (id: string) => channelDelete({ path: { id } })
    this.addChannelMember = (channelId: string, deviceId: string) => channelMemberAdd({ path: { channelId, deviceId } })
    this.removeChannelMember = (channelId: string, deviceId: string) => channelMemberRemove({ path: { channelId, deviceId } })
    this.items = (query: { readonly channelId?: string; readonly deviceId?: string; readonly mimeType?: string; readonly query?: string; readonly cursor?: string; readonly limit?: number }) => items({ query })
    this.item = (id: string) => item({ path: { id } })
    this.deleteItem = (id: string) => itemDelete({ path: { id } })
    this.requestContent = (itemId: string, contentId: string) => contentRequest({ path: { itemId, contentId }, body: {} })
    this.preview = (itemId: string, previewId: string) => preview({ path: { itemId, previewId } })
    this.content = (itemId: string, contentId: string) => content({ path: { itemId, contentId } })
    this.transfers = (limit = 100) => transfers({ query: { limit } })
    this.transfer = (id: string) => transfer({ path: { id } })
    this.cancelTransfer = (id: string) => transferCancel({ path: { id } })
  }
}

export const Api = { Client }
