# Clipboard X Server

Clipboard X 的自托管可信中心服务。它为 GNOME 扩展提供设备认证、Channel 同步、增量游标、懒加载内容物化与精确传输进度，并提供单管理员 Web 控制台。

## 开发

需要 Bun 1.3.14：

```sh
bun install --frozen-lockfile
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
```

分别在两个终端启动 Server 和 Web：

```sh
bun run dev:server
bun run dev:web
```

Web 开发服务位于 `http://127.0.0.1:3000`，Vite API 代理只读取 `web/.env*` 中的 `CBX_PROXY_URL`。先让该地址与 Server 的监听地址保持一致，并修改 `server/config.yaml` 中的唯一管理员密码，再登录管理控制台。添加设备时登记客户端生成的 DeviceId，再为该设备签发绑定的 API Key。DeviceId、Key、禁用状态与 Channel 配置会原子回写 YAML；客户端连接后同步的名称和图标保存在 SQLite。

`server/config.yaml` 是源码环境唯一的实际配置。根 `package.json` 的 `start` 与 `dev:server` 都先进入 `server/`，再由 Server 脚本显式读取该文件；根目录下即使存在旧的 `config.yaml` 也不会被这些入口读取。`server/config-dev.yaml` 和 `server/config-test.yaml` 是完整、互相独立的环境配置，需要使用 `--config` 显式选择；应用配置已关闭 mode 文件与 `import` 合并，不会把三份配置叠加为一份。

## 验证与发布

```sh
bun run typecheck
bun test
bun run build
bun run compile
```

`dist/` 包含可执行文件（或 Server bundle）、`web/dist`、`server/drizzle` 与 `server/config.example.yaml`。所有配置项都以单一 YAML 文件为权威来源；源码入口固定读取 `server/config.yaml`，独立部署时用 `--config <path>` 显式指定文件。编译产物通过 `--migrate` 显式执行迁移。生产配置见 [部署文档](docs/deployment.md)，备份、恢复、对象审计及 GC 见 [运维文档](docs/operations.md)，系统边界见 [架构文档](docs/architecture.md)，API 见 [协议文档](docs/protocol.md)。

默认上限为单对象 80 MiB、单条目 256 MiB、预览 1 MiB；按需物化超时 10 分钟。服务端自动清理默认关闭，启用后由 `cleanup` 配置控制周期和条目保留限制；内部采用固定小批次维护无引用对象。服务器能够读取所有已上传内容，本项目不提供端到端加密。
