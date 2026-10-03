# Server tests

Tests are grouped by the module or domain whose behavior they verify:

| Directory | Scope |
| --- | --- |
| `frame/` | Product-independent configuration, database, HTTP, security, logging, schemas, and date contracts |
| `config/` | Application configuration files, defaults, persistence, storage paths, and TLS options |
| `db/` | SQLite value normalization |
| `device/` | Client profiles, device response contracts, and the virtual device |
| `clipboard/` | Retention policies, scheduled cleanup, and object lifecycle |
| `http/` | Application composition, sessions, request validation, origins, errors, OpenAPI, and TLS listening |
| `support/` | Shared test helpers, not test cases |

`preload.ts` creates an isolated temporary configuration and data directory. Keep it
at this location because the workspace test command and root Bun configuration use it.

Run from the repository root:

```bash
bun run --cwd server test
bun run --cwd server test ./test/device
bun run --cwd server test ./test/config/cleanup.test.ts
```

Each test file must provide its own required initialization instead of relying on
another test file running first. TLS listener tests require permission to bind a
local port. Keep fixtures beside their domain unless they are genuinely shared.

Repository-wide release, deployment, and documentation checks live in [`../../tests`](../../tests).
