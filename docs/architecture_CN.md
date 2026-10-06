# 架构

[English](architecture.md)

Clipboard X Server 是一个基于 Bun 的 monorepo，包含 React 管理端单页应用和 Hono API 服务。Web 工作区不导入 Server 源码。生产发布包将构建后的单页应用放在 Server 旁边，由同一源站提供服务。

## Server 目录结构

Server 规模较小，因此采用 Create Hono App 的扁平目录结构：

```text
server/src/
  config/       产品配置单例与 YAML 回写
  db/           Schema 与唯一的 db/Database 单例
  dto/          请求和响应 Schema
  entry/        进程组装与启动
  frame/        从 Create Hono App 复制的基础设施
  repo/         SQLite 与本地对象持久化
  route/        静态 Hono 路由集合与 HTTP 适配
  service/      业务规则与事务
  session/      产品对 Frame 会话及安全能力的绑定
```

这里没有 `Application` 容器，也没有按领域划分的模块树。Repository 直接导入全局 `db` 门面；Service 导入 Repository 和全局 `config`；Route 导入 Service 单例，运行时不接收依赖包。`server/src/entry` 初始化数据库、仅注册一次健康检查和安全 Provider、依据 YAML 协调托管记录，并启动监听器。

## Frame 边界

`server/src/frame` 基于 Create Hono App Skill 脚手架，保留其配置加载器、字段映射与导入、SQLite 门面与同步事务作用域、生命周期、结构化日志、请求上下文、Hono 路由挂载、校验、认证 Provider、会话、健康检查、OpenAPI 生成及 Zod 扩展。

产品层对 Frame 的改动刻意保持有限：

- 默认端口为 `28787`；
- JWT 可选，因为 Clipboard X 使用不透明的管理员会话和设备 API Key；
- 受保护的路由可显式指定凭证读取器：管理员接口读取其 HttpOnly Cookie，设备接口使用标准 Bearer 读取器；
- 请求日志使用 Hono 实际命中的路由索引，使后面的单页应用兜底路由不会遮蔽真正命中的路由模板；
- 管理员会话保存在 `admin_sessions` 表中。

Frame 标准的 `Result<T>` 和错误处理器保持不变。Clipboard X 通过仅在生产组装入口安装的产品层错误处理器，维持既有的原始 JSON 及 `{ error: { code, message, requestId, details } }` API 约定。

## 配置与持久化

YAML 是用户可配置选项、唯一管理员、已签发设备 API Key 及其 DeviceId 绑定关系、禁用状态、Channel 和受管成员关系的权威来源。YAML 中省略的内部运行参数使用 Server 代码中定义的默认值。原生部署模板暴露 `app.host`、`app.port`、`app.timezone` 和 `app.data-dir`，以及 `web`、`limits`、`lifetimes`、`cleanup` 和受管记录。

由客户端持有的设备资料（`tag`、`iconKind`、`iconColor`）是 SQLite 中的运行时数据，只能由持有已绑定 Key 的客户端更新。内置的虚拟 Server 设备是另一条仅存在于 SQLite 的记录，启动时派生生成；它不会写入 YAML，也不能通过管理控制台配置。Frame 的全局 `Config` 负责加载、导入、插值、映射、校验并冻结静态配置段。导出的应用层 `config` 单例为管理员、凭证和 Channel 的变更提供受控接口。控制台变更会校验完整的受管配置，将便于阅读的块状 YAML 写入已同步到磁盘的临时文件，以原子重命名方式替换原文件并设置 `0600` 权限，然后更新 SQLite。启动时的协调过程会修复数据库中与 YAML 来源不一致的记录。

SQLite 是元数据存储，通过唯一的 `src/db/index.ts` 门面使用；文件数据库启用外键、安全整数、忙碌超时和 WAL，并使用纳入版本控制的 Drizzle 迁移。二进制内容保存在本地按内容寻址的对象目录树中。上传通过临时文件流式写入，检查大小、增量计算 SHA-256，仅在验证通过后重命名。

## HTTP 接口

设备接口挂载在 `/api/v1`，管理员接口挂载在 `/admin/api/v1`，健康检查位于 `/health/live` 和 `/health/ready`。Frame 的接口面配置从同一套静态路由集合产生这些路径，并由已挂载的路由生成 OpenAPI。Clipboard X Server 负责这份跨平台约定：生成的 OpenAPI 文档是机器可读的权威定义，[协议文档](protocol_CN.md)则说明 Schema 无法表达的语义。GNOME 及未来其他操作系统上的客户端使用已发布的 API 版本，不定义 Server 的行为。

管理员变更使用 HttpOnly、SameSite=Strict Cookie，并拒绝跨站浏览器请求。有 `Sec-Fetch-Site` 时使用 Fetch Metadata，因此 Vite 的同源代理工作流只需设置 `CBX_PROXY_URL`；非浏览器客户端则回退到显式 Origin 匹配。管理员先注册由客户端生成的 DeviceId，再签发已绑定该设备的 Key。设备请求同时发送 Bearer API Key 和 `X-Clipboard-X-Device-Id`，Server 会在处理请求前拒绝不匹配的组合。`PUT /api/v1/device/profile` 只能更新客户端持有的标签与图标，不能更改已注册的 DeviceId。

## 同步与生命周期

剪贴板发布分为两个阶段：不可变 Manifest、流式上传预览与 `eager` 内容对象，最后提交。提交前条目不可见。按需内容请求只创建一份持久化的物化请求和来源设备工作项；并发请求方共用该工作，但各自保留独立的传输。Channel 变更通过不透明 Cursor 背后的单调递增序列提供。

每个活跃 Channel 在 SQLite 中都有虚拟 Server 设备作为固定成员。这一成员关系不可编辑或删除，且不会出现在 YAML 中。虚拟设备发布通过 Web 创建的完整 `eager` 内容，再经普通 Channel Feed 将变更分发给真实成员。它没有 API Key，设备侧的每条接收路径都会拒绝它，因此其他设备发布的内容不会回传给这个虚拟身份。

Server 清理默认开启，周期为一小时，每个设备在每个 Channel 最多保留 1000 条，最长保存 30 天。策略可配置运行间隔以及全局、设备、Channel、设备与 Channel 交集、条目年龄限制。无引用对象使用固定 24 小时宽限期，清理工作按有界批次处理。清理只删除服务端副本，保留客户端本地历史。同步变更、删除 Tombstone 和传输历史不会被清理，因为裁剪这些数据需要离线 Cursor 重置协议。手动对象清理命令仍须指定 `--delete` 才会删除。可信的自托管 Server 能读取上传的内容；它不是端到端加密系统。
