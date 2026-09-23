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

### 快速开始

准备 `compose.yaml` 和 `.env`（可从仓库的 `.env.example` 复制），在 `.env` 中填写长度大于 6 位的 `CBX_ADMIN_PASSWORD`：

```sh
docker compose up -d
```

打开 **http://127.0.0.1:28787**。首次启动会在持久化卷中生成 YAML 配置并迁移数据库；后续配置以该 YAML 为准，控制台更改会写回。通过公网访问时，在首次启动前将 `.env` 的 `CBX_PUBLIC_ORIGIN` 设为 HTTPS 地址，反向代理见[部署指南](docs/deployment.md)。

### 自行部署

下载对应平台的 Release 压缩包并解压。在解压目录中复制配置模板，把 `administrator.password` 改为自己的密码，然后启动：

```sh
cp server/config.example.yaml server/config.yaml
./clipboard-x-server --config ./server/config.yaml --migrate --serve
```

管理界面默认位于 **http://127.0.0.1:28787**。

### 从源码启动

GitHub 仓库上线后，可克隆源码：

```sh
git clone https://github.com/Guleo/clipboard-x-server.git
cd clipboard-x-server
```

目前也可以直接使用本地源码目录。需要 Bun 1.3.14。在源码根目录执行：

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

打开 **http://127.0.0.1:3000**。Server 默认监听 `127.0.0.1:28787`；Web 的 Vite 代理从 `web/.env*` 读取 `CBX_PROXY_URL`，默认应指向该 Server 地址。`dev:server` 会先运行数据库迁移。

无论采用哪种方式，登录后都可以创建 Channel，登记客户端生成的 DeviceId 并签发绑定的 Key。客户端持有 Key 后，会把自己的设备名称和图标同步到服务端。

## ⚙️ 数据与配置

| 存放位置 | 保存内容 |
| --- | --- |
| YAML 配置文件 | 唯一管理员、设备与 Key 的绑定、Channel 及成员关系、运行参数；**权威配置源**。 |
| SQLite | 剪切板元数据、传输状态和客户端同步的设备资料。 |
| 本地对象目录 | 图片等二进制内容，以内容寻址方式保存。 |

Server 启动时读取 YAML；管理界面修改受管配置后会同步写回该文件。源码入口使用 `server/config.yaml`，Docker 首次启动在配置卷中生成 `/app/config/config.yaml`，自行部署时由 `--config <path>` 指定。mode 和 `import` 自动合并已关闭。请将含凭据的实际配置文件保持为 `0600`，不要提交到版本库。

> [!IMPORTANT]
> 这是可信的自托管服务，Server 能读取已上传的内容，**不提供端到端加密**。自动清理默认关闭；启用后仅移除服务端数据，不控制客户端的本地历史。开启保留上限前请先备份。

## 📦 验证与部署

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
bun run compile
```

`bun run build` 生成 Server bundle，`bun run compile` 生成可执行文件；两者都会把 Web 构建、迁移文件和示例配置组装到 `dist/`。HTTPS、容器和 systemd 的完整步骤见[部署指南](docs/deployment.md)。

## 📚 文档与协议

| 文档 | 内容 |
| --- | --- |
| [架构说明](docs/architecture.md) | Server、Web、配置、SQLite 和对象存储的职责边界。 |
| [部署指南](docs/deployment.md) | 可执行文件、容器、反向代理与 systemd。 |
| [运维指南](docs/operations.md) | 备份与恢复、周期清理、对象审计及 GC。 |
| [OpenAPI 3.1](server/openapi/openapi.json) | 路由、认证与数据结构的机器可读规范。 |
| [Protocol guide](docs/protocol.md) · [中文协议指南](docs/zh-CN/protocol.md) | 跨请求流程、错误语义和客户端兼容性约定。 |

协议由 Clipboard X Server 维护；协议变更会同步更新 Schema、OpenAPI、指南和契约测试。
