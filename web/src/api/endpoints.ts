import { z } from "zod"
import { Request } from "@/frame/request"
import {
  AdministratorSchema, ChannelSchema, ClipboardItemSchema, ClipboardPageSchema, DeviceSchema,
  IssuedDeviceKeySchema, OverviewSchema, TransferSchema,
  PublicationSchema, UploadCompletionSchema, UploadResultSchema,
  RetentionSchema,
} from "./schemas"

const root = "/admin/api/v1"
const empty = () => undefined
const blob = (value: unknown) => {
  if (!(value instanceof Blob)) throw new Error("Expected a Blob response")
  return value
}

export const endpoints = {
  session: Request.define({ operation: "session.read", method: "GET", path: `${root}/session`, auth: true, response: "json", decode: (value) => z.object({ administrator: AdministratorSchema }).parse(value) }),
  login: Request.define({ operation: "session.create", method: "POST", path: `${root}/session`, auth: false, response: "json", decode: (value) => z.object({ administrator: AdministratorSchema }).parse(value) }),
  logout: Request.define({ operation: "session.delete", method: "DELETE", path: `${root}/session`, auth: true, response: "empty", decode: empty }),
  administratorUpdate: Request.define({ operation: "administrator.update", method: "PATCH", path: `${root}/administrator`, auth: true, response: "empty", decode: empty }),
  retention: Request.define({ operation: "retention.read", method: "GET", path: `${root}/retention`, auth: true, response: "json", decode: RetentionSchema.parse }),
  retentionUpdate: Request.define({ operation: "retention.update", method: "PATCH", path: `${root}/retention`, auth: true, response: "json", decode: RetentionSchema.parse }),
  overview: Request.define({ operation: "overview.read", method: "GET", path: `${root}/overview`, auth: true, response: "json", decode: OverviewSchema.parse }),
  devices: Request.define({ operation: "devices.list", method: "GET", path: `${root}/devices`, auth: true, response: "json", decode: (value) => z.object({ devices: z.array(DeviceSchema) }).parse(value).devices }),
  deviceCreate: Request.define({ operation: "devices.create", method: "POST", path: `${root}/devices`, auth: true, response: "json", decode: DeviceSchema.parse }),
  deviceUpdate: Request.define({ operation: "devices.update", method: "PATCH", path: `${root}/devices/:id`, auth: true, response: "json", decode: DeviceSchema.parse }),
  deviceDelete: Request.define({ operation: "devices.delete", method: "DELETE", path: `${root}/devices/:id`, auth: true, response: "empty", decode: empty }),
  deviceKeyIssue: Request.define({ operation: "deviceKeys.issue", method: "POST", path: `${root}/devices/:id/keys`, auth: true, response: "json", decode: IssuedDeviceKeySchema.parse }),
  deviceKeyRevoke: Request.define({ operation: "deviceKeys.revoke", method: "DELETE", path: `${root}/devices/:deviceId/keys/:keyId`, auth: true, response: "empty", decode: empty }),
  channels: Request.define({ operation: "channels.list", method: "GET", path: `${root}/channels`, auth: true, response: "json", decode: (value) => z.object({ channels: z.array(ChannelSchema) }).parse(value).channels }),
  channelCreate: Request.define({ operation: "channels.create", method: "POST", path: `${root}/channels`, auth: true, response: "json", decode: ChannelSchema.parse }),
  channelUpdate: Request.define({ operation: "channels.update", method: "PATCH", path: `${root}/channels/:id`, auth: true, response: "json", decode: ChannelSchema.parse }),
  channelDelete: Request.define({ operation: "channels.delete", method: "DELETE", path: `${root}/channels/:id`, auth: true, response: "empty", decode: empty }),
  channelMemberAdd: Request.define({ operation: "channelMembers.add", method: "PUT", path: `${root}/channels/:channelId/members/:deviceId`, auth: true, response: "empty", decode: empty }),
  channelMemberRemove: Request.define({ operation: "channelMembers.remove", method: "DELETE", path: `${root}/channels/:channelId/members/:deviceId`, auth: true, response: "empty", decode: empty }),
  items: Request.define({ operation: "items.list", method: "GET", path: `${root}/items`, auth: true, response: "json", decode: ClipboardPageSchema.parse }),
  item: Request.define({ operation: "items.read", method: "GET", path: `${root}/items/:id`, auth: true, response: "json", decode: ClipboardItemSchema.parse }),
  itemDelete: Request.define({ operation: "items.delete", method: "DELETE", path: `${root}/items/:id`, auth: true, response: "empty", decode: empty }),
  itemCreate: Request.define({ operation: "items.create", method: "POST", path: `${root}/channels/:channelId/items`, auth: true, response: "json", decode: PublicationSchema.parse }),
  previewUpload: Request.define({ operation: "previews.upload", method: "PUT", path: `${root}/uploads/:uploadId/previews/:previewId`, auth: true, response: "json", decode: UploadResultSchema.parse }),
  contentUpload: Request.define({ operation: "contents.upload", method: "PUT", path: `${root}/uploads/:uploadId/contents/:contentId`, auth: true, response: "json", decode: UploadResultSchema.parse }),
  uploadComplete: Request.define({ operation: "uploads.complete", method: "POST", path: `${root}/uploads/:uploadId/complete`, auth: true, response: "json", decode: UploadCompletionSchema.parse }),
  contentRequest: Request.define({ operation: "contents.request", method: "POST", path: `${root}/items/:itemId/contents/:contentId/requests`, auth: true, response: "json", decode: (value) => z.object({ transfer: TransferSchema }).parse(value) }),
  preview: Request.define({ operation: "previews.read", method: "GET", path: `${root}/items/:itemId/previews/:previewId`, auth: true, response: "blob", decode: blob }),
  content: Request.define({ operation: "contents.read", method: "GET", path: `${root}/items/:itemId/contents/:contentId`, auth: true, response: "blob", decode: blob }),
  transfers: Request.define({ operation: "transfers.list", method: "GET", path: `${root}/transfers`, auth: true, response: "json", decode: (value) => z.object({ transfers: z.array(TransferSchema) }).parse(value).transfers }),
  transfer: Request.define({ operation: "transfers.read", method: "GET", path: `${root}/transfers/:id`, auth: true, response: "json", decode: TransferSchema.parse }),
  transferCancel: Request.define({ operation: "transfers.cancel", method: "DELETE", path: `${root}/transfers/:id`, auth: true, response: "json", decode: TransferSchema.parse }),
} as const
