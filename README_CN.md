<h1 align="center">Clipboard X Server</h1>
<p align="center"><a href="README.md">English</a> · <a href="README_CN.md">简体中文</a></p>
<p align="center"><strong>跨设备剪切板的自托管同步中心</strong></p>
<p align="center">Bun · Hono · SQLite · React</p>

Clipboard X Server 连接不同平台的设备客户端，提供 Channel 同步、按需传输和 Web 管理界面。

[查看界面预览](docs/preview.png)

## ✨ 能做什么

| | 能力 | 说明 |
| :---: | --- | --- |
| 🔄 | 跨设备同步 | 通过 Channel 和增量游标分发剪切板内容，支持设备间同步与服务端手动发布。 |
| 🖼️ | 按需获取 | 先查看预览，使用时再物化完整内容；上传和下载都有可追踪的传输进度。 |
| 🔑 | 设备身份 | 先登记客户端的 DeviceId，再签发与该设备绑定的 API Key；设备名称与图标由客户端同步。 |
| 🧹 | 保留策略 | 可在 Web 界面设置周期清理和多维度条目上限，仅清理服务端副本。 |

## 客户端平台

| 平台 | 客户端实现 |
| --- | --- |
| GNOME Shell | [**`clipboard-x-gnome`**](https://github.com/guleoo/clipboard-x-gnome) |

## 🚀 启动方式

### 快速开始：从 GHCR 部署

公开镜像地址：`ghcr.io/guleoo/clipboard-x-server:latest`。

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/main/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/main/docker/.env.example -o .env
```

然后编辑 `.env`，设置管理员密码：

```dotenv
CBX_HOST=0.0.0.0
CBX_PORT=28787
CBX_ADMIN_USERNAME=admin
CBX_ADMIN_PASSWORD=change-this-password
```

如果使用 HTTPS 反向代理，再额外配置：

```dotenv
CBX_PUBLIC_ORIGIN=https://你的域名
CBX_COOKIE_SECURE=true
```

启动并查看状态：

```sh
docker compose up -d
docker compose ps
```

管理界面默认位于 **http://127.0.0.1:28787**。

### 自行部署

从 [GitHub Releases](https://github.com/guleoo/clipboard-x-server/releases) 下载对应平台的压缩包并解压。

```sh
cp server/config.example.yaml server/config.yaml
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

管理界面默认位于 **http://127.0.0.1:28787**。

### 从源码启动

从本仓库克隆源码：

```sh
git clone https://github.com/guleoo/clipboard-x-server.git
cd clipboard-x-server
```

使用 `package.json` 中声明的 Bun 版本。在源码根目录执行：

```sh
bun install --frozen-lockfile
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
```

编辑 `server/config.yaml` 中的 `administrator.password`。在两个终端分别运行：

```sh
bun run dev:server
```

```sh
bun run dev:web
```

## 📦 验证与部署

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
bun run compile
bun run package
```

`bun run build` 生成 Server bundle。

`bun run compile` 生成可执行文件。

`bun run package` 在 `release/` 生成包含可执行文件、Web 资源、迁移文件、配置模板、许可证和文档的压缩包。

源码部署的数据默认位于 `server/data/`，日志默认位于 `server/logs/`。

TLS 与容器部署步骤见[部署指南](docs/deployment_CN.md)。

## 📚 文档与协议

| 文档 | 内容 |
| --- | --- |
| [架构说明](docs/architecture_CN.md) | Server、Web、配置、SQLite 和对象存储的职责边界。 |
| [部署指南](docs/deployment_CN.md) | 可执行文件、TLS 与容器部署。 |
| [版本发布](docs/release_CN.md) | 六平台 GitHub Release 的验证、beta 与正式版流程。 |
| [运维指南](docs/operations_CN.md) | 备份与恢复、周期清理、对象审计及 GC。 |
| [OpenAPI 3.1](server/openapi/openapi.json) | 路由、认证与数据结构的机器可读规范。 |
| [Protocol guide](docs/protocol.md) · [中文协议指南](docs/protocol_CN.md) | 跨请求流程、错误语义和客户端兼容性约定。 |

同步协议在本仓库维护；协议变更时同步更新 Schema、OpenAPI、指南和契约测试。

## 许可证

本项目采用 [GPL-3.0-or-later](LICENSE.md) 许可证。
