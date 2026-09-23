# Deployment

## Native release

Download and unpack the archive for your platform. In the unpacked directory, copy `server/config.example.yaml` to `server/config.yaml` and set a unique `administrator.password`. Start with migration enabled:

```sh
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

For public access, also set `app.hostname: 0.0.0.0`, the HTTPS `web.public-origin`, and `web.cookie-secure: true`. Relative paths in YAML resolve from its directory. Keep the entire release directory, including `web/dist` and `server/drizzle`.

The YAML file is the sole authoritative source for runtime options, the administrator, devices,
complete device API keys, channels, and memberships. The process reads it at startup. Changes made
through the console are written with a temporary file, synced, atomically renamed, and forced to mode
`0600`. Manual changes take effect on the next process start.

Server-side `cleanup` is optional and disabled by default. When enabled, it removes
older server copies on the configured interval without deleting local client history;
see [operations](operations.md) before applying a limit to existing data.

## systemd

The supplied unit reads `/var/lib/clipboard-x-server/config.yaml`, allowing the unprivileged service
account to update it from the console. Install the release under `/opt/clipboard-x-server`. In the
copied YAML file, set `database.migrations-folder: /opt/clipboard-x-server/server/drizzle` and use
absolute database, storage and Web paths before running migrations and enabling the service:

```sh
install -d -o clipboard-x -g clipboard-x -m 0700 /var/lib/clipboard-x-server
install -o clipboard-x -g clipboard-x -m 0600 server/config.yaml /var/lib/clipboard-x-server/config.yaml
sudo -u clipboard-x /opt/clipboard-x-server/clipboard-x-server --config /var/lib/clipboard-x-server/config.yaml --migrate
systemctl enable --now clipboard-x-server
```

Use the supplied Nginx example or an equivalent TLS reverse proxy. Preserve streaming
(`proxy_request_buffering off`) and make the proxy body limit at least `limits.maxObjectBytes`.

## Container

In `docker/`, create `.env` from `.env.example` and set a unique `CBX_ADMIN_PASSWORD` of 7-256 characters. Set `CBX_PUBLIC_ORIGIN` to the public HTTPS URL when using a reverse proxy. Then start:

```sh
docker compose up -d
```

The image contains `config.yaml` with `${env:...}` placeholders. A named volume holds that file so the Web console can update it; another volume stores SQLite and binary objects. Keep both volumes when updating the image. Environment changes apply to placeholders that remain in YAML. If the console has written a concrete value, that YAML value takes precedence. For HTTPS, set `web.cookie-secure: true` in the configuration volume. Compose pulls the published image, or builds from source when it is available locally.

The built-in health paths are unauthenticated: `/health/live` checks the process, while
`/health/ready` also checks SQLite. The container health check reads the same YAML file.
