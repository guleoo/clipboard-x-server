# Deployment

## Native release

Download and unpack the archive for your platform. In the unpacked directory, copy `server/config.example.yaml` to `server/config.yaml` and set a unique `administrator.password`. Start with migration enabled:

```sh
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

On Windows, extract the `.tar.gz` archive, then use PowerShell in its unpacked directory:

```powershell
Copy-Item server/config.example.yaml server/config.yaml
.\clipboard-x-server.exe --config .\server\config.yaml --migrate --serve
```

The native YAML template puts `host`, `port`, `timezone`, and `data-dir` under `app`. The root also contains
`web`, `limits`, `lifetimes`, `cleanup`, `administrator`, `devices`, and `channels`. The example
listens on `0.0.0.0:28787` and uses UTC. Other internal settings use defaults defined in
Server code. Relative paths in YAML resolve from its directory.

For optional direct HTTPS, add `app.tls.cert-file` and `app.tls.key-file` with readable PEM paths and enable `web.cookie-secure`. These TLS fields are intentionally absent from the minimal native template. `web.public-origin` is optional for direct access; configure it when the browser-facing origin differs from what the Server sees (for example, behind an HTTPS reverse proxy). Keep the entire release directory, including `web/dist` and `server/drizzle`.

The YAML file is the authoritative source for configurable options, the administrator, devices,
complete device API keys, channels, and memberships. The process reads it at startup. Changes made
through the console are written with a temporary file, synced, atomically renamed, and forced to mode
`0600`. Manual changes take effect on the next process start.

Server-side `cleanup` is optional and disabled by default. When enabled, it removes
older server copies on the configured interval without deleting local client history;
see [operations](operations.md) before applying a limit to existing data.

The archive includes the executable, Web assets, migrations, a configuration template, the license, and documentation. Keep the extracted directory together. Restart the process after certificate renewal; binding a privileged port such as 443 requires appropriate operating-system permissions.

## Container from GHCR

The public image is `ghcr.io/guleoo/clipboard-x-server:latest`. Download only the two deployment files; no source checkout or local build is needed:

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example -o .env
```

Set a unique `CBX_ADMIN_PASSWORD` of 7-256 characters in `.env` (for example, generate one with `openssl rand -hex 24`). `CBX_HOST` and `CBX_PORT` set the host-side published address and port; the container always listens on `0.0.0.0:28787`. The defaults expose HTTP on port 28787 on all host network interfaces; `CBX_PUBLIC_ORIGIN` may stay empty for direct HTTP access. Set `CBX_HOST=127.0.0.1` if access should be limited to the host. The Server derives the origin from each request. Use HTTPS for public access. Start with `docker compose up -d`.

For HTTPS behind a reverse proxy, set `CBX_PUBLIC_ORIGIN=https://clipboard.example.com` and `CBX_COOKIE_SECURE=true`. If serving HTTPS directly from the container instead, also download the optional TLS override:

```sh
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.tls.yaml -o compose.tls.yaml
```

Set the two existing host PEM files and the corresponding container paths in `.env`:

```dotenv
CBX_TLS_CERT_HOST_FILE=/absolute/path/to/fullchain.pem
CBX_TLS_KEY_HOST_FILE=/absolute/path/to/privkey.pem
CBX_TLS_CERT_FILE=/app/tls/fullchain.pem
CBX_TLS_KEY_FILE=/app/tls/privkey.pem
CBX_HOST=0.0.0.0
CBX_PORT=443
CBX_PUBLIC_ORIGIN=https://clipboard.example.com
CBX_COOKIE_SECURE=true
```

```sh
docker compose -f compose.yaml -f compose.tls.yaml up -d
```

Compose mounts the two files read-only, without mounting a certificate directory; they must be readable by container UID 10001. Restart the container after certificate renewal.

The image contains `config.yaml` with `app.host`, `app.port`, `app.timezone`, and `app.data-dir`, plus `${env:...}` placeholders for container-specific settings. Keep `app.tls.cert-file`, `app.tls.key-file`, `web.public-origin`, and `web.cookie-secure` in the container YAML so the HTTPS and browser-origin settings can be supplied through `.env`.

A named volume holds that file so the Web console can update it; another volume stores SQLite and binary objects. Keep both volumes when updating the image. Environment changes apply to placeholders that remain in YAML. If the console has written a concrete value, that YAML value takes precedence. An existing configuration volume is not replaced by a newer image.

Before starting the new image with an older persisted YAML, put the listener, timezone, and data directory settings in `app.host`, `app.port`, `app.timezone`, and `app.data-dir`; for the stock container configuration, use `0.0.0.0`, `28787`, `UTC`, and `../data`. Remove the old `app.hostname` field and any root-level `host`, `port`, `timezone`, or `data-dir` fields. The Server reads these settings only from `app`.

The built-in health paths are unauthenticated: `/health/live` checks the process, while
`/health/ready` also checks SQLite. The container health check reads the same YAML file.
