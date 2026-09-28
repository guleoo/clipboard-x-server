<h1 align="center">Clipboard X Server</h1>
<p align="center"><strong>跨设备剪切板的自托管同步中心</strong></p>
<p align="center">Bun · Hono · SQLite · React</p>

Clipboard X Server 与不同平台上的设备客户端连接，提供 Channel 同步、按需传输和 Web 管理界面。

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
| GNOME Shell | [**`clipboard-x-gnome`**](https://github.com/Guleo/clipboard-x-gnome) |

## 🚀 启动方式

### 快速开始：从 GHCR 部署

公开镜像：`ghcr.io/guleoo/clipboard-x-server:latest`。以下步骤只下载 Compose 文件和环境变量样例，**不需要克隆仓库或在本地构建镜像**。

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example -o .env
```

用 `openssl rand -hex 24` 生成管理员密码，然后编辑 `.env`，至少填入：

```dotenv
CBX_HOST=0.0.0.0
CBX_ADMIN_PASSWORD=粘贴生成的密码
```

HTTP 直连无需设置 `CBX_PUBLIC_ORIGIN`。如果使用 HTTPS 反向代理，再额外配置：

```dotenv
CBX_PUBLIC_ORIGIN=https://你的域名
CBX_COOKIE_SECURE=true
```

启动并查看状态：

```sh
docker compose up -d
docker compose ps
```

默认发布到宿主机所有网络接口的 `28787` 端口。镜像已包含带环境变量占位符的 YAML 配置；
Compose 将 `.env` 中的值传给 Server，配置和数据分别保存在持久化卷中。
`CBX_HOST`/`CBX_PORT` 控制宿主机对外发布的地址和端口；容器内固定监听 `0.0.0.0:28787`。
直连 TLS 的证书文件挂载方式见[部署指南](docs/deployment.md)。

### 自行部署

下载对应平台的 Release 压缩包并解压。在解压目录中复制配置模板，把 `administrator.password` 改为自己的密码，然后启动：

```sh
cp server/config.example.yaml server/config.yaml
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

管理界面默认位于 **http://127.0.0.1:28787**。
配置文件在 `app` 下设置 `host`、`port`、`timezone` 和 `data-dir`；未列入模板的内部选项使用代码中的默认值。更多部署方式见[部署指南](docs/deployment.md)。

### 从源码启动

克隆源码：

```sh
git clone https://github.com/guleoo/clipboard-x-server.git
cd clipboard-x-server
```

需要 Bun 1.3.14。在源码根目录执行：

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

打开 **http://127.0.0.1:3000**。Server 默认监听 `0.0.0.0:28787`；Web 的 Vite 代理从 `web/.env*` 读取 `CBX_PROXY_URL`，本机开发时应指向 `127.0.0.1:28787`。`dev:server` 会先运行数据库迁移。

无论采用哪种方式，登录后都可以创建 Channel，登记客户端生成的 DeviceId 并签发绑定的 Key。客户端持有 Key 后，会把自己的设备名称和图标同步到服务端。

## 📦 验证与部署

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
bun run compile
bun run package
```

`bun run build` 生成 Server bundle，`bun run compile` 生成可执行文件，`bun run package` 在 `release/` 生成包含可执行文件、Web 资源、迁移文件、配置模板、许可证和文档的压缩包。源码部署的数据默认位于 `server/data/`，日志默认位于 `server/logs/`。TLS 与容器部署步骤见[部署指南](docs/deployment.md)。

## 📚 文档与协议

| 文档 | 内容 |
| --- | --- |
| [架构说明](docs/architecture.md) | Server、Web、配置、SQLite 和对象存储的职责边界。 |
| [部署指南](docs/deployment.md) | 可执行文件、TLS 与容器部署。 |
| [版本发布](docs/release.md) | 六平台 GitHub Release 的验证、beta 与正式版流程。 |
| [运维指南](docs/operations.md) | 备份与恢复、周期清理、对象审计及 GC。 |
| [OpenAPI 3.1](server/openapi/openapi.json) | 路由、认证与数据结构的机器可读规范。 |
| [Protocol guide](docs/protocol.md) · [中文协议指南](docs/protocol_CN.md) | 跨请求流程、错误语义和客户端兼容性约定。 |

协议由 Clipboard X Server 维护；协议变更会同步更新 Schema、OpenAPI、指南和契约测试。

## 许可证

本项目采用 [GPL-3.0](LICENSE.md)。
