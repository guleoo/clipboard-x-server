# Operations

## Backup and restore

SQLite runs in WAL mode. `config.yaml` is part of the authoritative state and must be backed up together with SQLite and the object tree. For the simplest consistent recovery point, stop the service first:

```sh
systemctl stop clipboard-x-server
cp -a /var/lib/clipboard-x-server /backup/clipboard-x-server-$(date +%F)
systemctl start clipboard-x-server
```

To restore, stop the service, move the current data directory aside, restore `config.yaml`, the complete database, and the object tree from the same recovery point with ownership/mode preserved, run the strict audit, then start and check readiness. Keep `config.yaml` at mode `0600`.

Before upgrades, back up data and run the new executable against a copy. Migrations are transactional and only move forward; a database newer than the binary fails explicitly.

## Object audit and collection

Both commands use the same data environment as the server and should normally run while the service is stopped for a stable report:

```sh
bun run audit:objects -- --config /path/to/config.yaml
bun run server/scripts/objects.ts audit --strict --config /path/to/config.yaml
bun run gc:objects -- --config /path/to/config.yaml
bun run server/scripts/objects.ts gc --delete --config /path/to/config.yaml
```

Audit is read-only. GC is also report-only by default and deletes only zero-reference objects older than `lifetimes.objectGcGraceSeconds` when `--delete` is supplied. Deletion is irreversible without a backup.

## Failure drills

1. Restore a backup into a temporary directory and point a copied YAML file's `storage.dataDirectory` to it.
2. Run `audit --strict`, start on a temporary port, then verify `/health/ready`, admin login, and one object download.
3. Stop the temporary server and record duration plus audit result.
4. For a missing-object drill, remove one object only in the disposable restore and confirm strict audit reports `missing_file`; never mutate production data for the drill.

Logs are newline-delimited JSON and omit request/response bodies, credentials, cookies, and full object paths. Monitor 5xx responses, `failed`/`expired` transfers, readiness, disk usage, and audit failures. Rotate service logs through the process supervisor.

Run `bun run test:network` where local listening is permitted to verify real Bun `Fetch` streaming in addition to the default port-free Hono route tests.

Run `bun run benchmark` on release hardware to exercise the documented 2,000 publications, 200 materializations, 100,000 progress writes, 100,000-row keyset page, and real 80 MiB streamed object. Treat the printed durations as a host-specific baseline, not universal pass/fail thresholds.

Run `bun audit` against an npm-compatible audit endpoint for known dependency advisories and `bun run audit:licenses` to review every direct runtime/development dependency license. A registry HTTP error means the advisory scan was unavailable, not that no vulnerabilities exist.
