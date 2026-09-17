# Architecture

Clipboard X Server is a Bun monorepo with a React management SPA and a Hono API service. The Web
workspace imports no Server source. Production releases package the built SPA beside the Server so
both are served from one origin.

## Server layout

The Server uses the Create Hono App flat layout because this is a small service:

```text
server/src/
  config/       product configuration singleton and YAML writeback
  db/           schema and the sole db/Database singleton
  dto/          request and response schemas
  entry/        process composition and startup
  frame/        copied Create Hono App infrastructure
  repo/         SQLite and local object persistence
  route/        static Hono route collections and HTTP adapters
  service/      business rules and transactions
  session/      product binding for the Frame session/security capability
```

There is no `Application` container and no modular domain tree. Repositories import the global `db`
facade directly. Services import repositories and the global `config` directly. Routes import service
singletons and never receive a dependency bundle at runtime. `server/src/entry` initializes the
database, registers health/security providers exactly once, reconciles YAML-owned records, and starts
the listener.

## Frame boundary

`server/src/frame` is based on the Create Hono App Skill scaffold and retains its configuration loader,
field mapping and imports, SQLite facade and synchronous transaction scope, lifecycle, structured
logging, request context, Hono route mounting, validation, auth provider, sessions, health checks,
OpenAPI generation, and Zod extensions.

Product changes are deliberately narrow:

- the default port is `28787`;
- JWT is optional because Clipboard X uses opaque administrator sessions and device API keys;
- secure routers accept an explicit credential reader so the administrator surface can read its
  HttpOnly cookie while the device surface uses the standard Bearer reader;
- request logging uses Hono's executed route index so a later SPA catch-all cannot hide the matched
  route template;
- the session table maps onto the existing `admin_sessions` migration history.

Frame's standard `Result<T>` and error handler remain intact. Clipboard X keeps its established raw
JSON and `{ error: { code, message, requestId, details } }` API contract through a product-owned error
handler installed only by the production composition root.

## Configuration and persistence

YAML is the authoritative source for all runtime options, the single administrator, issued device API
keys and their DeviceId bindings, disabled state, channels, and managed memberships. Client-owned device
profiles (`tag`, `iconKind`, and `iconColor`) are runtime data in SQLite and are updated only by the client holding the
bound key. The built-in virtual Server device is another SQLite-only record derived at startup: it is
never written to YAML and cannot be configured through the console. Frame's global `Config` loads,
imports, interpolates, maps, validates, and freezes static sections. The exported application `config`
singleton adds the controlled mutation API for administrator/credential/channel changes. A console mutation validates the complete
managed configuration, writes a human-readable block YAML document through a synced temporary file,
atomically renames it with mode `0600`, and then updates SQLite. Startup reconciliation repairs any
database drift from the YAML source.

SQLite is the metadata store and runs through the single `src/db/index.ts` facade with foreign keys,
safe integers, a busy timeout, WAL for file databases, and checked-in Drizzle migrations. Binary bodies
remain in the local content-addressed object tree. Uploads stream through a temporary file, enforce size,
compute SHA-256 incrementally, and rename only after validation.

## HTTP surfaces

Device operations are mounted at `/api/v1`; administrator operations are mounted at
`/admin/api/v1`; health remains at `/health/live` and `/health/ready`. Frame surface configuration
produces these paths from one static route collection, and OpenAPI is generated from those mounted
routes.

Administrator mutations use an HttpOnly, SameSite=Strict cookie and reject cross-site browser requests.
Fetch Metadata (`Sec-Fetch-Site`) is used when present, which keeps Vite's same-origin proxy workflow
working with only `CBX_PROXY_URL`; explicit Origin matching is the fallback for non-browser clients.
The administrator first registers the client-generated DeviceId and then issues a key already bound to
that device. Device requests send both the Bearer API key and `X-Clipboard-X-Device-Id`; the Server
rejects a mismatch before serving the request. `PUT /api/v1/device/profile` updates only the
client-owned tag and icon, and cannot change the registered DeviceId.

## Synchronization and lifecycle

Clipboard publication is two-phase: an immutable manifest, streamed preview/eager objects, then commit.
Items stay invisible until commit. On-demand content creates one durable materialization request and
source work item; concurrent requesters reuse that work while retaining independent transfers. Channel
changes use monotonic sequences behind opaque cursors.

Every active Channel has the virtual Server device as a fixed member in SQLite. That membership cannot
be edited or removed and is deliberately absent from YAML. The virtual device publishes complete eager
content created through the Web and fans those changes out to real members through the normal Channel
feed. It has no API key and every device-side receive path rejects it, so content published by other
devices is never delivered back to the virtual identity.

Server cleanup is disabled by default. When enabled, one hierarchical policy controls trigger timing,
global/device/Channel/device-in-Channel/age item limits, unreferenced-object grace, and bounded work per
run. It removes only server copies and preserves client-local history. Synchronization changes,
deletion tombstones, and transfer history are deliberately excluded because pruning them requires an
offline cursor reset protocol. The manual object command still requires `--delete`. The trusted
self-hosted Server can read uploaded content; it is not end-to-end encrypted.
