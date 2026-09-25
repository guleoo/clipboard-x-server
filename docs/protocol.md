# Clipboard X synchronization protocol (HTTP API v1)

> English · [简体中文](protocol_CN.md)

This document is the authoritative human-readable protocol between Clipboard X Server and every
device client. The protocol is intentionally independent of any desktop environment, operating
system, UI toolkit, or client implementation.

## Read this first

The Server stores device identities, Channel membership, clipboard metadata, previews, and uploaded
content. Small text is normally sent in full. Large text and images can be published with a small
preview; their original bytes are fetched from the source device only when needed. A newly joined
device reads the retained Channel history, not just changes published after it joined.

The usual journey for a device is:

1. Generate a persistent UUID v4 **DeviceId**. An administrator registers it, issues its API key,
   and adds it to a **Channel** (a group of devices that share clipboard items).
2. Ask for the Server version and limits; update the device's friendly name and icon.
3. Publish an **item** (one clipboard event) by sending its metadata **manifest**, uploading the
   requested bytes, and completing the upload. The item becomes visible only after completion.
4. Read the Channel's **changes** with a persistent **cursor**. Fetch each new item's metadata and
   small **preview**. A cursor is an opaque bookmark; never decode or construct it.
5. When someone needs full lazy content, request it. The source device receives **work** to upload
   its original. Both sides track a **transfer** for progress and failure.

All examples below show the relevant fields; placeholders such as `"item UUID"` and
`"64 lowercase hex characters"` describe values and are **not** literal values to send. Use the
field tables and examples in this guide for integration. The [endpoint index](#endpoint-index)
provides a quick lookup once the workflow is familiar.

## Authority and evolution

Clipboard X Server owns the protocol. **Read this guide to implement a client**: it explains the
requests, responses, state transitions, and recovery rules in the order a device encounters them.
The generated [`OpenAPI specification`](../server/openapi/openapi.json) is a supplementary
machine-readable reference for generators and exact schemas, not a prerequisite for reading this
guide. Any disagreement between this guide, OpenAPI, and the running Server is a release defect.

Regenerate and verify the OpenAPI document from the Server routes and DTO schemas with:

```sh
bun run --filter '@clipboard-x/server' openapi
bun run openapi:check
```

Clients implement a published Server API version; they do not define it. Within `/api/v1`, the Server
may add optional response fields and new endpoints. Clients must ignore unknown response fields.
Removing or renaming a field, making an optional field required, or changing an existing state or
operation's meaning requires a new major path such as `/api/v2`.

## 1. Conventions

- All endpoints are below `/api/v1` at the configured server address. The address may include a
  reverse-proxy path prefix.
- Users may enter an IP, `IP:port`, HTTP, or HTTPS address. If no scheme is supplied, the client
  uses `http://`; it never silently upgrades HTTP to HTTPS.
- Unless stated otherwise, requests and responses are UTF-8 JSON with `camelCase` fields.
- Every device API request carries `Authorization: Bearer <API key>` and
  `X-Clipboard-X-Device-Id: <UUID v4>`. The server must verify that the API key belongs to that
  DeviceId.
- DeviceId is an identity and routing key, not an authentication credential. Device Tag is sent only
  when device profile data changes and is not repeated on every request.
- Time fields are Unix epoch milliseconds. Byte counts are logical uncompressed bytes.
- `cursor` is an opaque server-generated string. Clients store and return it without parsing it.

Errors use:

```json
{
  "error": {
    "code": "invalid_key",
    "message": "Device API key is invalid",
    "requestId": "request-id",
    "details": {}
  }
}
```

Clients must limit JSON, error bodies, previews, and complete content, and must validate UUIDs, MIME
types, sizes, and SHA-256. Unknown fields may be ignored; a missing required field or invalid field
must reject the complete response.

Treat `error.code` as the programmatic signal; `message` is for display or diagnostics, and
`requestId` helps locate a failure in Server logs. Common outcomes:

| HTTP status / code | What to do |
| --- | --- |
| `400 invalid_request` | Fix the request or discard an invalid cursor; do not blindly retry. |
| `401 invalid_key` | Ask for a valid device key. |
| `403 device_mismatch`, `channel_forbidden`, `device_disabled` | Check identity or Channel membership; do not retry without a change. |
| `404 not_found` | The item, object, or work no longer exists. |
| `409 item_conflict` | An ItemId was reused with different data or after deletion; create a new item. |
| `409 content_not_ready` | Wait for the materialization transfer before downloading. |
| `410 transfer_expired` | Start a new upload or content request. |
| `413 too_large` | Reduce the item, representation, or preview size. |
| `429 rate_limited` | Retry with bounded backoff. |

Server failures may also return `500 internal_error`; keep the `requestId`, but never log clipboard
content or the API key. See the specific endpoint below for its normal success status.

## 2. Core paths

The following sections explain the requests in the order they are usually made. All device paths
start with `/api/v1` and use the two authentication headers described above.

### 2.1 Get server status

`GET /api/v1/status`

Returns the protocol version, server version, state, and capability limits:

```json
{
  "apiVersion": 1,
  "serverVersion": "0.1.0",
  "state": "online",
  "capabilities": {
    "supportedMimeTypes": ["text/plain;charset=utf-8", "image/png"],
    "maxItemBytes": 268435456,
    "maxPreviewBytes": 1048576
  },
  "pendingItems": 0,
  "activeTransfers": 0,
  "lastSyncAt": 0,
  "revision": 1
}
```

`apiVersion` must be `1`. `state` is `online` or `degraded`.

| Field | How a client uses it |
| --- | --- |
| `apiVersion` | Refuse to synchronize when unsupported; it is separate from `serverVersion`. |
| `capabilities.supportedMimeTypes` | Publish only supported representations. |
| `capabilities.maxItemBytes` | Limit the sum of uncompressed content sizes in one item. |
| `capabilities.maxPreviewBytes` | Limit each preview; the Server also enforces its own per-object limit. |
| `pendingItems`, `activeTransfers`, `lastSyncAt`, `revision` | Server-wide diagnostic counters, not change-feed cursors. |

### 2.2 Get and update device information

- Before the client connects, the administrator registers its client-generated DeviceId and issues
  an API key bound to that DeviceId.
- `GET /api/v1/device`: returns the device profile and state for the current API key.
- `PUT /api/v1/device/profile`: updates client-owned friendly profile data with
  `{"tag":"Work computer","iconKind":"archlinux"}`.

Device response:

```json
{
  "id": "UUID",
  "tag": "Work computer",
  "iconKind": "archlinux",
  "iconColor": {"light": "#ffffff"},
  "state": "online",
  "lastSeenAt": 1787620000000,
  "createdAt": 1787610000000,
  "updatedAt": 1787620000000,
  "kind": "client"
}
```

`iconKind` is a nonempty plain-text icon identifier, at most 128 characters, with no carriage
returns, line feeds, or NUL bytes. The server stores and returns it unchanged; no image or SVG
is transferred. Each client maps identifiers it recognizes to local assets and renders unknown
identifiers with its own generic fallback.
`iconColor` may be omitted from the profile request, in which case the server stores white.
When supplied, it requires a lowercase `#RRGGBB` `light` value and optionally accepts a `dark`
value. Omitted `dark` means clients derive the dark color from `light`; providing `dark` preserves
that exact color. Responses include `iconColor` and preserve the absence of derived `dark`.
The light color is used on dark backgrounds; the dark color is used on light backgrounds.
To derive a linked dark color, parse the light color into RGB channels, take the largest channel
`maximum`, multiply each channel by `min(1, 96 / maximum)` (or `1` when `maximum` is `0`), round
each channel to the nearest integer and format as lowercase `#RRGGBB`. Thus `#ffffff` yields
`#606060`. Clients recalculate this color locally; the server does not persist the derived value.

`GET /api/v1/device` and the `PUT` response both return the profile above. `tag` is a user-friendly
name; `iconKind` is a client-defined identifier rather than an enum. `kind` is `client` for ordinary
devices and `virtual` for Server-originated items. `lastSeenAt`, `createdAt`, and `updatedAt` are
epoch milliseconds; `state` reflects availability (`online`, `offline`, `disabled`, or `unavailable`).
Disabled devices cannot authenticate. A profile update sends both `tag` (1–256 characters) and
`iconKind`; `iconColor` is optional. Profile fields are not repeated in each clipboard publication.

### 2.3 Select a Channel

`GET /api/v1/channels` returns Channels joined by the current device (**200**):

```json
{
  "channels": [{
    "id": "UUID",
    "name": "Home",
    "createdAt": 1787610000000,
    "updatedAt": 1787620000000
  }]
}
```

A device can read and write only Channels it has joined. The client chooses its active Channel
locally and keeps an independent changes cursor for each one. An empty list means an administrator
must add the device to a Channel before it can publish or read items.

### 2.4 Publish clipboard content

`POST /api/v1/channels/{channelId}/items`

The first phase submits an immutable manifest. Binary data is never embedded in JSON:

```json
{
  "id": "item UUID",
  "createdAt": 1787620000000,
  "originDeviceId": "device UUID",
  "contents": [{
    "id": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 123,
    "sha256": "64 lowercase hex characters",
    "delivery": "eager"
  }],
  "previews": [{
    "id": "preview-id",
    "contentId": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 80,
    "sha256": "64 lowercase hex characters",
    "truncated": true
  }]
}
```

`delivery=eager` uploads complete content while the item is created. `on-demand` first synchronizes
the manifest and preview, then asks the source device for the original when a remote user actually uses it.
Pick `eager` for small text; use `on-demand` for large text, images, or other supported formats. The client decides
which representations are lazy, subject to the Server's size limits. For each content representation,
`size` and `sha256` describe the **full original bytes**, not its preview. A preview has its own
ID, MIME type, size, digest, and `truncated` flag; `contentId` ties it to its original.

| Manifest field | Meaning |
| --- | --- |
| `id` | Client-generated UUID v4 ItemId; remains stable on retries. |
| `createdAt` | Item creation time in epoch milliseconds. |
| `originDeviceId` | Must equal the authenticated DeviceId. |
| `contents` | 1–16 representations; each has a unique `id`, MIME type, byte size, SHA-256, and `delivery`. |
| `previews` | 0–16 small representations; each has a unique `id` and references an existing `contentId`. |

`POST` returns **201** with an upload session and the IDs of objects still needed:

```json
{
  "itemId": "item UUID",
  "uploadId": "upload UUID",
  "previewIds": ["preview-id"],
  "contentIds": ["content-id"],
  "transfer": {
    "id": "transfer UUID",
    "itemId": "item UUID",
    "deviceId": "device UUID",
    "kind": "publish",
    "direction": "upload",
    "state": "queued",
    "completedBytes": 0,
    "totalBytes": 203,
    "peerDeviceIds": [],
    "createdAt": 1787620000000,
    "updatedAt": 1787620000000,
    "error": {"code": "", "message": ""}
  }
}
```

`previewIds` and `contentIds` list only the objects the Server still needs. Empty lists can mean
the publication was already completed. For requested objects, the client then streams:

- `PUT /api/v1/uploads/{uploadId}/previews/{previewId}`
- `PUT /api/v1/uploads/{uploadId}/contents/{contentId}`
- `POST /api/v1/uploads/{uploadId}/complete`

The PUT body is the original byte stream. `Content-Type` is the manifest MIME type and
`Content-Length` must match the manifest. The server counts bytes and computes SHA-256 while reading;
each successful PUT returns **200** with `{ "size": number, "sha256": "..." }`. Finish with
`POST .../complete` (**200**) to receive `{ "transfer": ... }`. Failed validation or a missing
object must not publish the item. Repeating the same ItemId with the same manifest, an already
uploaded object, or a completed upload is safe; changing a manifest under an existing ItemId is not.
The Server can return a `completed` transfer immediately when no upload is needed.

### 2.5 Synchronize clipboard content

1. `GET /api/v1/channels/{channelId}/changes?cursor=...&limit=200` gets incremental changes.
2. For an `upsert`, `GET /api/v1/channels/{channelId}/items/{itemId}` gets the manifest.
3. `GET .../previews/{previewId}` gets a size-limited preview.
4. Only when the user copies, pastes, saves, or edits does the client request an `on-demand` object.

For browsing or searching retained history, clients may also use:

`GET /api/v1/channels/{channelId}/items?cursor=...&limit=100&query=...`

The response contains `items`, an opaque next `cursor`, and `hasMore`. This **list cursor is not a
changes cursor**: do not interchange or derive one from the other. Omitting the changes cursor starts
from the beginning of the retained change feed, including entries from before a device joined.
Deleting an item for every
member of the Channel uses `DELETE /api/v1/channels/{channelId}/items/{itemId}`. A local-history
deletion is a client-only operation and must not call this endpoint.

Change page:

```json
{
  "cursor": "opaque-next-cursor",
  "hasMore": false,
  "changes": [{
    "sequence": 18,
    "kind": "upsert",
    "itemId": "item UUID",
    "reason": ""
  }]
}
```

`kind` is `upsert` or `remove`. On `upsert`, fetch the item. On `remove`, discard the Server item from
the local synchronized view. The client persists the page's **changes** cursor only after applying
the entire page. When `hasMore=true`, fetch another page; the cursor must advance to avoid a loop.
An empty `changes` page can still contain a valid cursor to persist.

The item response (**200**) includes its Channel, source device, content manifest, and current
`availability` for each representation:

```json
{
  "id": "item UUID",
  "channelId": "channel UUID",
  "channelName": "Home",
  "createdAt": 1787620000000,
  "updatedAt": 1787620000000,
  "origin": {
    "deviceId": "UUID",
    "tag": "Phone",
    "iconKind": "android",
    "iconColor": {"light": "#ffffff"},
    "kind": "client"
  },
  "contents": [{
    "id": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 123,
    "sha256": "64 lowercase hex characters",
    "delivery": "eager",
    "availability": "available"
  }],
  "previews": []
}
```

The `origin.kind` value `virtual` means the Server's Web console published the item. The
`contents[].availability` value indicates whether original bytes are already `available` or still
`source-required`, `requesting`, `expired`, or `failed`. A preview's `truncated` flag says whether
the original contains more than the preview. When a preview exists, download it with
`GET /api/v1/channels/{channelId}/items/{itemId}/previews/{previewId}` (**200**, binary bytes).
The binary response provides `Content-Type`, `Content-Length`, and `X-Content-Sha256`; check them
against the manifest before displaying or storing the preview. Do not download a large original
just to populate the history list.

## 3. Transfers and exact progress

Every upload and on-demand materialization has a UUID `transfer.id`:

```json
{
  "id": "transfer UUID",
  "itemId": "item UUID",
  "deviceId": "device UUID",
  "kind": "publish",
  "direction": "upload",
  "state": "transferring",
  "completedBytes": 65536,
  "totalBytes": 1048576,
  "peerDeviceIds": [],
  "createdAt": 1787620000000,
  "updatedAt": 1787620000100,
  "error": {"code":"","message":""}
}
```

| Transfer field | Meaning |
| --- | --- |
| `id`, `itemId`, `deviceId` | Transfer identity, item, and device whose transfer this is. |
| `kind` | `publish` for a new item, `content` for a requested original. |
| `direction` | `upload` or `download` from this device's perspective. |
| `state` | See the state table below; only terminal states stop polling. |
| `completedBytes`, `totalBytes` | Processed byte count within `[0,totalBytes]`; on `completed` the two values match. |
| `peerDeviceIds` | Devices involved in or expected to receive the transfer. |
| `createdAt`, `updatedAt`, `error` | Timestamps and machine-readable failure code plus display message. |

| State | Meaning |
| --- | --- |
| `queued` | Created, but data transfer has not started. |
| `waiting-for-peer` | The original is not on the Server; the source device must answer a work item. |
| `transferring` | Bytes are moving. |
| `verifying` | Received bytes are being checked or committed. |
| `completed` | Server-side work succeeded; the requester can download available content. |
| `failed`, `cancelled`, `expired` | Terminal error, explicit cancellation, or elapsed deadline. |

Management endpoints:

- `GET /api/v1/transfers`: recover recent transfers for the current device; returns
  `{ "transfers": [ ... ] }`.
- `GET /api/v1/transfers/{transferId}`: poll one transfer; returns the transfer object.
- `DELETE /api/v1/transfers/{transferId}`: request cancellation; returns its updated transfer.

Upload progress is measured from bytes actually written to the HTTP request body. On-demand waiting
and source upload are reflected in the Server transfer. **A `completed` Server transfer does not mean
the requester has finished downloading**: measure that last leg from the bytes written to local
temporary storage, then verify size and SHA-256 before publishing the content locally. Clients should
throttle UI updates independently of accurate byte accounting.

## 4. On-demand materialization

The requesting device calls (**202**, response `{ "transfer": ... }`):

`POST /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}/requests`

If the Server already has the complete object, the transfer may already be `completed`. Otherwise
it is `waiting-for-peer`, and the Server queues exactly one source work item even if multiple devices
request the same original. Each requester still has its own transfer. The source device polls:

`GET /api/v1/work?cursor=...&limit=100`

```json
{
  "cursor": "opaque-work-cursor",
  "hasMore": false,
  "work": [{
    "id": "work UUID",
    "type": "materialize-content",
    "itemId": "item UUID",
    "contentId": "content-id"
  }]
}
```

The `work` array contains only queued jobs. Save its cursor even when the array is empty: the Server
may have advanced past jobs already accepted or rejected. If the source cannot find the local object,
it calls `POST /api/v1/work/{workId}/reject` with
`{"code":"source_content_missing","message":""}` (**204**, no body). Other rejection codes are
`upload_failed` and `cancelled`. Otherwise it calls
`POST /api/v1/work/{workId}/accept` (**200**), receives `{ "uploadId": "...", "transfer": ... }`,
then uploads the content with `PUT /api/v1/uploads/{uploadId}/contents/{contentId}` and finishes with
`POST /api/v1/uploads/{uploadId}/complete`.

After its request transfer completes, the requesting device streams
`GET /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}` (**200**, binary bytes),
checks `Content-Type`, `Content-Length`, and `X-Content-Sha256` against the manifest, and verifies
the downloaded bytes. Downloading before the original is ready returns `409 content_not_ready`.
The server web UI must use the same on-demand flow for large content rather than requiring every original
object to remain permanently cached.

## 5. Client responsibilities and recovery

- Persist a separate change cursor for every Channel plus the work cursor. Store cursor updates
  atomically only after the corresponding page has been processed.
- Poll changes, work, and unfinished transfers while synchronization is active. A five-second interval
  is a reasonable default; clients should use bounded backoff after failures.
- Cancel outstanding HTTP requests and timers when synchronization is disabled or connection settings
  change. The protocol requires no device heartbeat or permanent local Service.
- Retain locally originated `on-demand` objects while advertising them as available. After restart,
  persisted manifests and cursors must allow work to resume using idempotent requests.
- Suppress clipboard loops using ItemId, content hashes, and programmatic-write tracking rather than
  modifying synchronized content.
- Bound every JSON body and binary stream before allocation, stream large objects, verify size and
  SHA-256, and commit downloads atomically.

## 6. Administrator surface

Administrator endpoints live under `/admin/api/v1`, use an HttpOnly, SameSite=Strict session cookie,
and are separate from the device API. Mutating requests must be same-origin. A browser-based console
normally uses these actions:

| Task | Endpoint | Result |
| --- | --- | --- |
| Sign in, inspect session, sign out | `POST`, `GET`, `DELETE /admin/api/v1/session` | Cookie-backed administrator session. |
| Register and manage devices | `GET`, `POST /admin/api/v1/devices`; `PATCH`, `DELETE /admin/api/v1/devices/{deviceId}` | Register a client-generated DeviceId before issuing its key. |
| Issue or revoke keys | `POST /admin/api/v1/devices/{deviceId}/keys`; `DELETE /admin/api/v1/devices/{deviceId}/keys/{keyId}` | One key is bound to one device. |
| Create and manage Channels | `GET`, `POST /admin/api/v1/channels`; `PATCH`, `DELETE /admin/api/v1/channels/{channelId}` | Channel names and membership are controlled by the administrator. |
| Add or remove members | `PUT`, `DELETE /admin/api/v1/channels/{channelId}/members/{deviceId}` | Controls the device's ability to read and publish. |
| Inspect or delete stored items | `GET /admin/api/v1/items`, `GET`, `DELETE /admin/api/v1/items/{itemId}` | Server-wide view and deletion, not a device's local history. |
| View lazy content | `GET .../previews/{previewId}`, `POST .../contents/{contentId}/requests`, `GET .../contents/{contentId}` below `/admin/api/v1/items/{itemId}` | Use the same source-work flow as device requests. |
| Monitor transfers | `GET /admin/api/v1/transfers`, `GET`, `DELETE /admin/api/v1/transfers/{transferId}` | Server-wide transfer list, details, and cancellation. |
| Inspect overview or retention | `GET /admin/api/v1/overview`; `GET`, `PATCH /admin/api/v1/configuration/cleanup` | Operational status and cleanup policy. |

The Server owns one immutable virtual device that is a fixed member of every Channel. It has no device
API key and cannot poll device changes or work. Publications from the Web console use this identity and
reach real devices through the same Channel change feed.

Administrator publication is a two-phase upload:

```text
POST /admin/api/v1/channels/{channelId}/items
PUT  /admin/api/v1/uploads/{uploadId}/previews/{previewId}
PUT  /admin/api/v1/uploads/{uploadId}/contents/{contentId}
POST /admin/api/v1/uploads/{uploadId}/complete
```

The administrator manifest omits `originDeviceId`; the Server assigns the virtual device. Every
representation uses `delivery: eager` because the virtual device never accepts later materialization
work.

## 7. Client conformance checklist

A conforming device client must:

1. generate and persist a UUID v4 DeviceId before registration;
2. send the bound API key and DeviceId on every device request;
3. reject an unsupported `apiVersion` before starting synchronization;
4. treat cursors as opaque and detect a non-advancing cursor when `hasMore` is true;
5. implement manifest-first publication, streaming uploads, and size/SHA-256 verification;
6. preserve lazy `on-demand` behavior and service materialization work for its own content;
7. make retries idempotent and recover unfinished transfers after restart; and
8. ignore unknown response fields while rejecting missing or invalid required fields.

## Endpoint index

```text
GET    /api/v1/status
GET    /api/v1/device
PUT    /api/v1/device/profile
GET    /api/v1/channels
POST   /api/v1/channels/{channelId}/items
GET    /api/v1/channels/{channelId}/items
GET    /api/v1/channels/{channelId}/changes
GET    /api/v1/channels/{channelId}/items/{itemId}
DELETE /api/v1/channels/{channelId}/items/{itemId}
GET    /api/v1/channels/{channelId}/items/{itemId}/previews/{previewId}
POST   /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}/requests
GET    /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}
PUT    /api/v1/uploads/{uploadId}/previews/{previewId}
PUT    /api/v1/uploads/{uploadId}/contents/{contentId}
POST   /api/v1/uploads/{uploadId}/complete
GET    /api/v1/work
POST   /api/v1/work/{workId}/accept
POST   /api/v1/work/{workId}/reject
GET    /api/v1/transfers
GET    /api/v1/transfers/{transferId}
DELETE /api/v1/transfers/{transferId}
```
