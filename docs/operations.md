# Operations

## Backup and restore

SQLite runs in WAL mode. `config.yaml` is part of the authoritative state and must be backed up together with the complete `data-dir`, including SQLite WAL/SHM files and the object tree. For the simplest consistent recovery point, stop the Server process first. In the native layout, back up `server/config.yaml` and `server/data/` together; `server/logs/` is independent and optional for recovery. In Docker, back up both the configuration and data volumes.

To restore, stop the Server process, move the current data directory aside, restore `config.yaml`, the complete database, and the object tree from the same recovery point with ownership/mode preserved, run the strict audit, then start and check readiness. Keep `config.yaml` at mode `0600`.

Before upgrades, back up data and run the new executable against a copy. Migrations are transactional and only move forward; a database newer than the binary fails explicitly.

## Server-side cleanup

Cleanup is opt-in and can be edited from the Web configuration page. The complete YAML structure is:

```yaml
cleanup:
  enabled: true
  interval-millis: 3600000
  clipboard:
    max-items: 10000
    max-items-per-channel: 5000
    max-items-per-device: 1000
    max-items-per-device-per-channel: 500
    max-age-millis: 2592000000
```

The global limit counts every visible item. The device limit counts one device across all Channels,
including publications from the virtual Server device; the Channel limit counts every device in that
Channel; the device-in-Channel limit controls their intersection. Items are ordered by creation time,
then ID, and the oldest eligible items are removed first. Omit a clipboard limit to leave only that
dimension unlimited. `cleanup.enabled` is the master switch. Unreferenced binary objects are an
internal maintenance concern rather than a user-facing policy and use a fixed 24-hour grace period.

Cleanup runs only on the configured interval (default one hour). It does not run at startup, after a
publication, or immediately after saving a policy. The scheduler prevents overlapping runs. Internally,
candidate planning is indexed and cleanup uses fixed small transactions with an event-loop yield
between batches, so request handling can continue while a large backlog is drained. Active uploads and
content requests are deferred until a later batch or cycle.
Cleanup removes only the server copy and does not emit a `remove` sync event; client history follows
each client's own policy. A removed item ID remains reserved
and cannot be published again. Back up before enabling limits: server-side removal is irreversible
without a backup. If a client retained only a preview, it can no longer request full content from
the server after that item has been removed.

## Object audit and collection

Both commands use the same data environment as the server and should normally run while the service is stopped for a stable report:

```sh
bun run audit:objects -- --config /path/to/config.yaml
bun run server/scripts/objects.ts audit --strict --config /path/to/config.yaml
bun run gc:objects -- --config /path/to/config.yaml
bun run server/scripts/objects.ts gc --delete --config /path/to/config.yaml
```

Audit is read-only. The manual GC command is report-only by default. `--delete` removes only
unreferenced objects older than the fixed 24-hour internal grace period, measured from the time the last
reference was released. Enabled periodic cleanup performs the same maintenance in fixed small batches.
An object still referenced by another item or upload is not removed. File deletion is irreversible
without a backup.

## Failure drills

1. Restore a backup into a temporary directory and point a copied YAML file's `data-dir` to it.
2. Run `audit --strict`, start on a temporary port, then verify `/health/ready`, admin login, and one object download.
3. Stop the temporary server and record duration plus audit result.
4. For a missing-object drill, remove one object only in the disposable restore and confirm strict audit reports `missing_file`; never mutate production data for the drill.

Console and file logs use human-readable text and omit request/response bodies, credentials, cookies, and full object paths. Monitor 5xx responses, `failed`/`expired` transfers, readiness, disk usage, and audit failures. File logs rotate using the Server's built-in retention and size defaults.

Run `bun run test:network` where local listening is permitted to verify real Bun `Fetch` streaming in addition to the default port-free Hono route tests.

Run `bun run benchmark` on release hardware to exercise the documented 2,000 publications, 200 materializations, 100,000 progress writes, 100,000-row keyset page, 100,000-row cleanup candidate plan, and real 80 MiB streamed object. Treat the printed durations as a host-specific baseline, not universal pass/fail thresholds.

Run `bun audit` against an npm-compatible audit endpoint for known dependency advisories and `bun run audit:licenses` to review every direct runtime/development dependency license. A registry HTTP error means the advisory scan was unavailable, not that no vulnerabilities exist.
