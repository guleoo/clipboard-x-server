# Clipboard X Server

Clipboard X 的自托管可信中心服务。它为 GNOME 扩展提供设备认证、Channel 同步、增量游标、懒加载内容物化与精确传输进度，并提供单管理员 Web 控制台。

## 开发

需要 Bun 1.3.14：

```sh
bun install --frozen-lockfile
cp config.example.yaml config.yaml
chmod 600 config.yaml
```

分别在两个终端启动 Server 和 Web：

```sh
bun run dev:server
bun run dev:web
```

Web 开发服务位于 `http://127.0.0.1:3000`，Vite API 代理只读取 `web/.env*` 中的 `CBX_PROXY_URL`。先让该地址与 Server 的监听地址保持一致，并修改 `config.yaml` 中的唯一管理员密码，再登录管理控制台。添加设备时登记客户端生成的 DeviceId，再为该设备签发绑定的 API Key。DeviceId、Key、禁用状态与 Channel 配置会原子回写 YAML；客户端连接后同步的名称和图标保存在 SQLite。

## 验证与发布

```sh
bun run typecheck
bun test
bun run build
bun run compile
```

`dist/` 包含可执行文件（或 Server bundle）、`web/dist`、`server/drizzle` 与完整 YAML 配置示例。所有配置项都以单一 YAML 文件为权威来源；启动时用 `--config <path>` 指定文件，默认读取当前目录的 `config.yaml`。编译产物通过 `--migrate` 显式执行迁移。生产配置见 [部署文档](docs/deployment.md)，备份、恢复、对象审计及 GC 见 [运维文档](docs/operations.md)，系统边界见 [架构文档](docs/architecture.md)，API 见 [协议文档](docs/protocol.md)。

默认上限为单对象 80 MiB、单条目 256 MiB、预览 1 MiB；按需物化超时 10 分钟，对象删除宽限期 24 小时。条目不自动过期。服务器能够读取所有已上传内容，本项目不提供端到端加密。
