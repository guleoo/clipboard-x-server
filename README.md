<h1 align="center">Clipboard X Server</h1>
<p align="center"><a href="README.md">English</a> · <a href="README_CN.md">简体中文</a></p>
<p align="center"><strong>A self-hosted hub for clipboard sync across devices</strong></p>
<p align="center">Bun · Hono · SQLite · React</p>

Clipboard X Server connects device clients across platforms, providing Channel sync, on-demand transfers, and a Web console.

[View interface preview](docs/preview.png)

## ✨ What it does

| | Feature | Description |
| :---: | --- | --- |
| 🔄 | Cross-device sync | Distributes clipboard content through Channels and incremental cursors. You can also publish items manually from the Server. |
| 🖼️ | On-demand access | View a preview first, then materialize the complete content when needed; uploads and downloads have trackable progress. |
| 🔑 | Device identity | Register a client's DeviceId before issuing a device-bound API Key. The client syncs its name and icon. |
| 🧹 | Retention controls | Configure periodic cleanup and item limits in the Web console; cleanup removes only server-side copies. |

## Client platforms

| Platform | Client implementation |
| --- | --- |
| GNOME Shell | [**`clipboard-x-gnome`**](https://github.com/guleoo/clipboard-x-gnome) |

## 🚀 Get started

### Quick start: deploy from GHCR

Public image: `ghcr.io/guleoo/clipboard-x-server:latest`.

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/main/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/main/docker/.env.example -o .env
```

Edit `.env` and set the administrator password:

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

The Web console is available at **http://127.0.0.1:28787** by default.

### Native release

Download and extract the archive for your platform from [GitHub Releases](https://github.com/guleoo/clipboard-x-server/releases).

```sh
cp config.example.yaml config.yaml
./clipboard-x-server
```

The Web console is available at **http://127.0.0.1:28787** by default.

### Run from source

Clone the repository:

```sh
git clone https://github.com/guleoo/clipboard-x-server.git
cd clipboard-x-server
```

Use the Bun version declared in `package.json`. Run these commands from the repository root:

```sh
bun install --frozen-lockfile
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
```

Edit `administrator.password` in `server/config.yaml`. Run these in two terminals:

```sh
bun run dev:server
```

```sh
bun run dev:web
```

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
| [Deployment](docs/deployment.md) | Executables, TLS, and containers. |
| [Releases](docs/release.md) | Verification, beta, and stable GitHub Releases for six platforms. |
| [Operations](docs/operations.md) | Backup and restore, periodic cleanup, object audits, and garbage collection. |
| [OpenAPI 3.1](server/openapi/openapi.json) | Machine-readable routes, authentication, and data structures. |
| [Protocol guide](docs/protocol.md) · [中文协议指南](docs/protocol_CN.md) | Cross-request flows, error semantics, and client compatibility. |

The sync protocol is maintained in this repository; protocol changes update the Schema, OpenAPI, guides, and contract tests together.

## License

This project is licensed under [GPL-3.0-or-later](LICENSE.md).
