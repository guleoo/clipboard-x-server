# HTTP API v1

The authoritative machine-readable contract is [`server/openapi/openapi.json`](../server/openapi/openapi.json). Regenerate and verify it with:

```sh
bun run --filter '@clipboard-x/server' openapi
bun run openapi:check
```

Every `/api/v1` request requires `Authorization: Bearer <apiKey>` plus `X-Clipboard-X-Device-Id: <UUIDv4>`. Fields use camelCase, time uses epoch milliseconds, bytes are uncompressed values, and cursors are opaque. Admin mutations are same-origin and use an HttpOnly, SameSite=Strict session cookie.

The v1 device contract deliberately matches the GNOME extension in `/home/Guleo/Develop/Projects/Gnome/clipboard-x/docs/sync-protocol.md`. Additive response fields are permitted; removing/renaming fields or changing existing state meanings requires a new API version.
