# Deployment

## Build and run

Use Bun 1.3.14 on the target architecture:

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run compile
cd dist
cp config.example.yaml config.yaml
chmod 600 config.yaml
./clipboard-x-server --config ./config.yaml
```

For a compiled release, run the explicit migration operation before the first start and every upgrade:

```sh
./clipboard-x-server --config ./config.yaml --migrate
./clipboard-x-server --config ./config.yaml
```

Before starting, set a unique `administrator.password`. For production, also set
`app.hostname: 0.0.0.0`, the HTTPS `web.public-origin`, `web.cookie-secure: true`, and the required
database/storage paths. `app.timezone` defaults to `UTC`. Relative paths are resolved
from the YAML file's directory.

The YAML file is the sole authoritative source for runtime options, the administrator, devices,
complete device API keys, channels, and memberships. The process reads it at startup. Changes made
through the console are written with a temporary file, synced, atomically renamed, and forced to mode
`0600`. Manual changes take effect on the next process start.

The executable contains the Bun runtime but is still platform/architecture-specific. Build and
smoke-test separate Linux x64 and arm64 artifacts on their target libc baseline. Keep `web/dist`,
`server/drizzle`, `server/config`, and `config.yaml` beside the executable unless absolute paths are
configured.

## systemd

The supplied unit reads `/var/lib/clipboard-x-server/config.yaml`, allowing the unprivileged service
account to update it from the console. Install the release under `/opt/clipboard-x-server`, then:

```sh
install -d -o clipboard-x -g clipboard-x -m 0700 /var/lib/clipboard-x-server
install -o clipboard-x -g clipboard-x -m 0600 config.yaml /var/lib/clipboard-x-server/config.yaml
systemctl enable --now clipboard-x-server
```

Use the supplied Nginx example or an equivalent TLS reverse proxy. Preserve streaming
(`proxy_request_buffering off`) and make the proxy body limit at least `limits.maxObjectBytes`.

## Container

Copy `config.example.yaml` to `config.yaml`. Set `app.hostname: 0.0.0.0`,
`web.root: ./web/dist`, `database.url: ./data/clipboard-x.db`, and
`storage.data-directory: ./data`, then ensure UID/GID 10001 can update the file:

```sh
chown 10001:10001 config.yaml
chmod 600 config.yaml
docker compose up --build -d
```

Compose bind-mounts `config.yaml` read-write at `/app/config.yaml` and persists `/app/data` in a named
volume. Do not bake the real configuration into an image or commit it to source control.

The built-in health paths are unauthenticated: `/health/live` checks the process, while
`/health/ready` also checks SQLite. The container health check reads the same YAML file.
