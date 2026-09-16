# HTTP API v1

The authoritative machine-readable contract is [`server/openapi/openapi.json`](../server/openapi/openapi.json). Regenerate and verify it with:

```sh
bun run --filter '@clipboard-x/server' openapi
bun run openapi:check
```

Before a client connects, the administrator registers the client-generated DeviceId and issues an API
key bound to it. Every `/api/v1` request requires both `Authorization: Bearer <apiKey>` and
`X-Clipboard-X-Device-Id: <deviceId>`; the header must match the device bound to the key.
`PUT /api/v1/device/profile` accepts `{ tag, iconKind, iconColor? }` and updates only client-owned profile data.
`iconColor` is an optional object: `{ "light": "#ffffff", "dark": "#505050" }`. Colors use lowercase
`#RRGGBB`; `light` is required within the object, while `dark` is optional. If the whole field is
omitted, the server stores `{ "light": "#ffffff" }`. If `dark` is omitted, clients derive a suitable
dark color from `light`; supplying `dark` disables that linkage. Device, channel-member, and
clipboard-item origin responses include the stored object, leaving `dark` absent when linked.
Clients derive linked dark colors by parsing the light color into RGB channels, multiplying each
channel by `min(1, 96 / maximum)` where `maximum` is the largest channel (use `1` when zero),
rounding to the nearest integer, and formatting as lowercase `#RRGGBB`. For example,
`#ffffff` derives `#606060`. The light value is used on dark backgrounds, and the dark value
on light backgrounds; the server does not store derived values.
Fields use camelCase, time uses epoch milliseconds, bytes are uncompressed values, and cursors are
opaque. Admin mutations are same-origin and use an HttpOnly, SameSite=Strict session cookie.

The Server owns one immutable virtual device that is a fixed member of every Channel. It has no device
API key and cannot consume changes, items, previews, content, requests, or work from `/api/v1`. Web
publications use this identity through the administrator surface and are delivered to real Channel
members through the same change feed as any other publication.

Administrator publication is a two-phase upload:

```text
POST /admin/api/v1/channels/{channelId}/items
PUT  /admin/api/v1/uploads/{uploadId}/previews/{previewId}
PUT  /admin/api/v1/uploads/{uploadId}/contents/{contentId}
POST /admin/api/v1/uploads/{uploadId}/complete
```

The administrator manifest omits `originDeviceId`; the Server assigns the virtual device. All content
representations must use `delivery: eager`, because this identity never accepts later materialization
work.

The v1 device contract deliberately matches the GNOME extension in `/home/Guleo/Develop/Projects/Gnome/clipboard-x/docs/sync-protocol.md`. Additive response fields are permitted; removing/renaming fields or changing existing state meanings requires a new API version.
