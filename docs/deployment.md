# Deployment

> [简体中文](deployment_CN.md) · [Release guide](release.md)

## Native release

Download the archive for your platform from [GitHub Releases](https://github.com/guleoo/clipboard-x-server/releases) and unpack it. Keep the extracted directory together: it contains the executable, Web assets, SQLite migrations, the configuration template, OpenAPI specification, license, and documentation.

In the extracted directory, copy the template, set a unique `administrator.password` in `server/config.yaml`, and start the Server with migrations enabled:

```sh
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

On Windows, the archive is also `.tar.gz`. Extract it, then run these commands in its extracted directory with PowerShell:

```powershell
Copy-Item server/config.example.yaml server/config.yaml
# Edit server/config.yaml and set a unique administrator.password.
.\clipboard-x-server.exe --config .\server\config.yaml --migrate --serve
```

The template listens on `0.0.0.0:28787` and uses UTC. Listener `host` and `port`, `timezone`, and `data-dir` belong under `app`; the root also contains `web`, `limits`, `lifetimes`, `cleanup`, `administrator`, `devices`, and `channels`. Other internal settings use Server defaults. Relative paths in YAML resolve from the YAML file's directory. Binding a privileged port such as 443 requires the appropriate operating-system permissions.

For direct HTTPS, add readable PEM certificate and key paths to `app.tls` and set `web.cookie-secure` to `true`:

```yaml
app:
  tls:
    cert-file: /absolute/path/to/fullchain.pem
    key-file: /absolute/path/to/privkey.pem
web:
  cookie-secure: true
```

Add these fields to the existing template rather than replacing its other settings. The TLS fields are absent from the native template. Restart the process after certificate renewal. If an HTTPS reverse proxy terminates TLS instead, set `web.public-origin` to the browser-facing HTTPS origin and `web.cookie-secure` to `true`; the Server does not need its own certificate in that setup. `web.public-origin` is optional for direct access when the browser-facing origin matches what the Server sees.

The YAML file is the authoritative source for configurable options, the administrator, devices, complete device API keys, channels, and memberships. The process reads it at startup. Console changes are written to the file through a synced temporary file and atomic rename, with mode `0600`; manual edits take effect after restarting the process.

Server-side `cleanup` is optional and disabled by default. When enabled, it removes older server copies on the configured interval without deleting local client history. Read [operations](operations.md) and back up data before applying a limit to existing items.

## Container from GHCR

The public image is `ghcr.io/guleoo/clipboard-x-server:latest`. A stable release tag publishes `latest`; a prerelease publishes only its versioned tag. Download the two deployment files into a new directory; no source checkout or local build is needed:

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example -o .env
```

In `.env`, set a unique `CBX_ADMIN_PASSWORD` of 7–256 characters (for example, generate one with `openssl rand -hex 24`). You can change `CBX_ADMIN_USERNAME` from its `admin` default. `CBX_HOST` and `CBX_PORT` control the host-side published address and port; the container always listens on `0.0.0.0:28787`. By default, HTTP is published on port 28787 on all host interfaces. Set `CBX_HOST=127.0.0.1` to limit access to the host. For direct HTTP access, `CBX_PUBLIC_ORIGIN` can stay empty: the Server derives the origin from each request. Use HTTPS for public access.

Start the service from the directory containing `compose.yaml` and `.env`:

```sh
docker compose up -d
```

For HTTPS behind a reverse proxy, set `CBX_PUBLIC_ORIGIN=https://clipboard.example.com` and `CBX_COOKIE_SECURE=true` in `.env`. Configure the proxy to forward to the published HTTP port; it handles the certificate.

For HTTPS directly from the container, also download the TLS override:

```sh
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.tls.yaml -o compose.tls.yaml
```

Set both existing host PEM files and their matching paths inside the container in `.env`:

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

The override binds each certificate file read-only at its fixed container path; it does not mount a certificate directory. The files must be readable by container UID `10001`. `CBX_PORT=443` changes the host-side port; the container still listens on 28787. Restart the container after certificate renewal.

The image provides `/app/config/config.yaml` with `app.host`, `app.port`, `app.timezone`, and `app.data-dir`, plus environment placeholders for container-specific settings. Keep `app.tls.cert-file`, `app.tls.key-file`, `web.public-origin`, and `web.cookie-secure` in this YAML if those settings are to come from `.env`. A named configuration volume holds the YAML so the Web console can update it; another volume stores SQLite and binary objects. Keep and back up both volumes when updating. Environment changes affect only placeholders still present in YAML: a concrete value saved by the console takes precedence, and a newer image does not replace an existing configuration volume.

To update the image while retaining the volumes, run `docker compose pull` followed by `docker compose up -d` (or use both `-f` options for direct TLS). Before starting a new image against an older persisted YAML, place listener, timezone, and data-directory values in `app.host`, `app.port`, `app.timezone`, and `app.data-dir`. For the stock container, these are `0.0.0.0`, `28787`, `UTC`, and `../data`. Remove an old `app.hostname` or root-level `host`, `port`, `timezone`, or `data-dir`: the Server reads these settings only from `app`.

The unauthenticated `/health/live` endpoint checks the process; `/health/ready` also checks SQLite. The container health check reads the same YAML file. See [operations](operations.md) for backup and recovery guidance.
