# Architecture

Clipboard X Server is a Bun monorepo with two independent workspaces. `web` is a React SPA and imports no server code. `server` is a Hono application backed by SQLite WAL and a filesystem content-addressed object store. The checked-in OpenAPI 3.1 document is the cross-workspace contract.

## Runtime boundaries

- `server/src/http/app.ts` owns HTTP composition, middleware, health checks, error mapping, and static SPA delivery.
- Domain services own authorization and state transitions. Routes validate DTOs, then call services.
- YAML is the authoritative source for runtime options, the administrator, devices, API keys, channels, and memberships. Startup reconciles these records into SQLite; console mutations atomically rewrite YAML and update SQLite.
- SQLite contains metadata, cursors, durable transfers, uploads, work, and object references. Binary content is never stored in SQLite or JSON.
- Object writes stream into `.tmp`, enforce declared/configured size, hash while reading, and atomically rename only after validation.
- The release layout is `dist/clipboard-x-server`, `dist/web/dist`, and `dist/migrations` so source and compiled execution share the same default Web path relative to their working directory.

## Trust model

The self-hosted server is a trusted center and can read uploaded clipboard content. It is not end-to-end encrypted. A deployment has exactly one administrator. The YAML file contains the administrator password and complete device API keys in plaintext and is forced to mode `0600`; SQLite stores only Argon2id hashes. Devices use independently revocable API keys bound to a UUID v4 identity; every device request must carry both values.

## Synchronization

Publication is two-phase: immutable JSON manifest, then streamed preview/eager objects, then commit. An item is invisible until commit. On-demand originals create one durable materialization request and one source work item; multiple waiting devices/admin requests reuse that work and receive independent transfers. Channel changes use monotonic sequences behind an opaque versioned cursor.

## Data lifecycle

Items do not expire automatically. Deleting an item emits a channel removal and decrements referenced objects. Zero-reference objects remain for the configured grace period; the GC command only reports unless `--delete` is explicitly passed. The audit command checks missing, corrupt, untracked, and incorrectly referenced objects.
