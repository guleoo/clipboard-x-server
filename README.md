<h1 align="center">Clipboard X Server</h1>
<p align="center"><a href="README.md">English</a> · <a href="README_CN.md">简体中文</a></p>
<p align="center"><strong>A self-hosted hub for clipboard sync across devices</strong></p>
<p align="center">Bun · Hono · SQLite · React</p>

Clipboard X Server connects device clients across platforms, providing Channel sync, on-demand transfers, and a Web console.

## ✨ What it does

| | Feature | Description |
| :---: | --- | --- |
| 🔄 | Cross-device sync | Distributes clipboard content through Channels and incremental cursors. You can also publish items manually from the Server. |
| 🖼️ | On-demand access | View a preview first and fetch the complete content when needed, with progress tracking for uploads and downloads. |
| 🔑 | Device identity | Register a client's DeviceId before issuing a device-bound API Key. The client syncs its name and icon. |
| 🧹 | Retention controls | Configure periodic cleanup and item limits in the Web console; cleanup removes only server-side copies. |

## Client platforms

| Platform | Client implementation |
| --- | --- |
| GNOME Shell | [**`clipboard-x-gnome`**](https://github.com/Guleo/clipboard-x-gnome) |

## 🚀 Get started

### Quick start: deploy from GHCR

The public image is `ghcr.io/guleoo/clipboard-x-server:latest`. Download the Compose file and environment example:

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example -o .env
```

Edit `.env` and set a unique administrator password (you can generate one with `openssl rand -hex 24`):

```dotenv
CBX_HOST=0.0.0.0
CBX_PORT=28787
CBX_ADMIN_USERNAME=admin
CBX_ADMIN_PASSWORD=change-this-password
```

If you use an HTTPS reverse proxy, also set:

```dotenv
CBX_PUBLIC_ORIGIN=https://your-domain.example
CBX_COOKIE_SECURE=true
```

Start the container and check its status:

```sh
docker compose up -d
docker compose ps
```

Open the Web console at **http://127.0.0.1:28787** on the host. By default, `CBX_HOST` and `CBX_PORT` publish HTTP on all host interfaces at port 28787; the container listens on `0.0.0.0:28787`. The image already includes `config.yaml`, so no configuration file download is needed. Compose keeps configuration and data in separate named volumes. See the [deployment guide](docs/deployment.md) for TLS options.

### Native release

Download and extract the archive for your platform from [GitHub Releases](https://github.com/guleoo/clipboard-x-server/releases). In the extracted directory, copy the configuration template, set a unique `administrator.password` in `server/config.yaml`, and start the Server:

```sh
cp server/config.example.yaml server/config.yaml
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

The Web console is available at **http://127.0.0.1:28787**. The YAML template sets `host`, `port`, `timezone`, and `data-dir` under `app`; other internal options use code defaults. See the [deployment guide](docs/deployment.md) for more deployment options.
On Windows, use the PowerShell commands in that guide instead of the shell commands above.

### Run from source

Clone the repository:

```sh
git clone https://github.com/guleoo/clipboard-x-server.git
cd clipboard-x-server
```

Install Bun 1.3.14, then run these commands from the repository root:

```sh
bun install --frozen-lockfile
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
```

Set `administrator.password` in `server/config.yaml`, then use two terminals:

```sh
bun run dev:server
```

```sh
bun run dev:web
```

Open **http://127.0.0.1:3000**. The Server listens on `0.0.0.0:28787`; the Web development proxy reads `CBX_PROXY_URL` from `web/.env*` and points to `127.0.0.1:28787` for local development. `dev:server` runs database migrations first.

With any startup method, sign in to create a Channel, register a client's DeviceId, and issue its bound Key. The client then syncs its device name and icon.

## 📦 Verify and package

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
bun run compile
bun run package
```

`bun run build` produces the Server bundle.

`bun run compile` produces an executable.

`bun run package` creates an archive in `release/` with the executable, Web assets, migrations, configuration template, license, and documentation.

For source deployments, data defaults to `server/data/` and logs to `server/logs/`.

See the [deployment guide](docs/deployment.md) for TLS and container deployment.

## 📚 Documentation and protocol

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Responsibilities of the Server, Web console, configuration, SQLite, and object storage. |
| [Web architecture](web/docs/architecture.md) | Web application structure and major UI modules. |
| [Deployment](docs/deployment.md) | Executables, TLS, and containers. |
| [Releases](docs/release.md) | Verification, beta, and stable GitHub Releases for six platforms. |
| [Operations](docs/operations.md) | Backup and restore, periodic cleanup, object audits, and garbage collection. |
| [OpenAPI 3.1](server/openapi/openapi.json) | Machine-readable routes, authentication, and data structures. |
| [Protocol guide](docs/protocol.md) · [中文协议指南](docs/protocol_CN.md) | Cross-request flows, error semantics, and client compatibility. |

The sync protocol is maintained in this repository; protocol changes update the Schema, OpenAPI, guides, and contract tests together.

## License

This project is licensed under [GPL-3.0](LICENSE.md).
