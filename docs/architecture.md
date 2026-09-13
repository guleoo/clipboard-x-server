# Architecture

Clipboard X Server is a Bun monorepo with two independent workspaces. `web` is a React SPA and imports no server code. `server` is a Hono application backed by SQLite WAL and a filesystem content-addressed object store. The checked-in OpenAPI 3.1 document is the cross-workspace contract.

## Layout and runtime boundaries

- The Server uses the Create Hono App modular layout because identity, devices, channels, clipboard,
  transfers, operations, and the admin/device surfaces have durable boundaries. Application code lives
  under `server/src/modules/<domain>/<resource>`; the former mixed top-level application directories were removed.
- `server/src/entry` is the only production composition/listening boundary. Importing
  `server/src/index.ts` does not start a listener.
- `server/src/http/app.ts` owns top-level HTTP composition, middleware, health checks, error mapping,
  and static SPA delivery. All business routes are mounted before the first request.
- Routes own paths, OpenAPI metadata, boundary validation and response conversion. Services own
  authorization, transactions and state transitions; Repos own persistence queries.
- YAML is the authoritative source for runtime options, the administrator, devices, API keys, channels, and memberships. Startup reconciles these records into SQLite; console mutations atomically rewrite YAML and update SQLite.
- SQLite contains metadata, cursors, durable transfers, uploads, work, and object references. Binary content is never stored in SQLite or JSON.
- Object writes stream into `.tmp`, enforce declared/configured size, hash while reading, and atomically rename only after validation.
- The release layout is `dist/clipboard-x-server`, `dist/web/dist`, and `dist/server/drizzle` so source
  and compiled execution share the same paths relative to their configuration file.

## Selected capabilities

- Health: unauthenticated liveness and SQLite-backed readiness at `/health/live` and `/health/ready`.
- Auth and rate limiting: Argon2id passwords, independently revocable device keys, one administrator,
  same-origin checks, and bounded process-local HTTP rate limiting.
- Database-backed session: opaque administrator session tokens are hashed in SQLite. The product's
  existing cookie/session protocol is retained instead of the template JWT protocol.
- OpenAPI: generated from the real mounted routes and their request schemas, never a parallel path map.

Cache, Redis, OAuth, multi-tenancy, background-job infrastructure, dynamic queries, and external object
stores are intentionally omitted. Metadata uses SQLite; binary bodies use the local content-addressed
filesystem store.

The Skill normally treats configuration as immutable. Clipboard X deliberately replaces that Frame
configuration overlay: the single YAML file remains authoritative, and console changes atomically update
YAML and SQLite. This is a product requirement, not a second Web configuration system. YAML is emitted
as an indented, human-readable block document rather than compact inline data. The unused immutable
configuration implementation is not shipped alongside it.

The product also retains its established raw JSON response and error envelope instead of the Skill's
standard `Result<T>` envelope. Top-level Hono composition is therefore product-owned, while request
context, template-safe access logs, validation, rate limiting, OpenAPI metadata, server lifecycle, and
the SQLite runtime remain governed Frame infrastructure. Unused template composition helpers are not
kept as parallel dead code.

## HTTP and persistence policy

Device operations use `/api/v1`; administrator operations use `/admin/api/v1`. Ordinary responses keep
the established camelCase product JSON contract. Expected failures use
`{ error: { code, message, requestId, details } }`; unknown failures are logged and returned without
internal diagnostics. Binary downloads stream from the object store with length, MIME type, SHA-256,
ETag, and private immutable-cache headers.

SQLite defaults to `<storage.dataDirectory>/clipboard-x.sqlite`, with foreign keys, a bounded busy
timeout, and WAL for file databases. Drizzle owns schema definitions and checked-in migrations under
`server/drizzle`; migration is an explicit command and never runs on import or ordinary requests.
Repository calls use Drizzle expressions through the application Facade and share the active synchronous
Frame transaction executor. Binary content is intentionally outside SQLite under
`<storage.dataDirectory>/objects`.

## Trust model

The self-hosted server is a trusted center and can read uploaded clipboard content. It is not end-to-end encrypted. A deployment has exactly one administrator. The YAML file contains the administrator password and complete device API keys in plaintext and is forced to mode `0600`; SQLite stores only Argon2id hashes. Devices use independently revocable API keys bound to a UUID v4 identity; every device request must carry both values.

## Synchronization

Publication is two-phase: immutable JSON manifest, then streamed preview/eager objects, then commit. An item is invisible until commit. On-demand originals create one durable materialization request and one source work item; multiple waiting devices/admin requests reuse that work and receive independent transfers. Channel changes use monotonic sequences behind an opaque versioned cursor.

## Data lifecycle

Items do not expire automatically. Deleting an item emits a channel removal and decrements referenced objects. Zero-reference objects remain for the configured grace period; the GC command only reports unless `--delete` is explicitly passed. The audit command checks missing, corrupt, untracked, and incorrectly referenced objects.
