# Clipboard X Web 架构

> 简体中文 · [English](architecture.md)

Web 是单入口、纯客户端渲染的 React SPA。登录后首先进入 Channel 剪切板工作区：左侧切换 Channel，中间预览和操作剪切板内容，卡片区域独立滚动；Channel 创建、编辑和内容发布使用弹窗。设备、活动、配置和账户页面收纳在设置菜单中。配置页目前只管理服务端剪切板数据的周期清理策略，不控制客户端的本地历史。

Bun 负责工作区依赖、脚本和测试，Vite 负责开发服务器与生产构建。应用组合根是 `src/App.tsx`，唯一浏览器入口是 `src/main.tsx`。生产构建生成 `web/dist`，根发布流程将它和 Server 可执行文件一起组装，由 Server 同源提供。

## 基础设施

- React 19、TypeScript 严格模式和 Vite。
- React Router Declarative Mode。`src/routes` 中的扁平 Route Node 是唯一导航事实；`frame/router/core` 校验并编译节点，`Router.View` 建立唯一的 `BrowserRouter`。
- Zustand 管理认证摘要、路由发布、最近页面和主题偏好。页面内交互状态仍由组件持有。
- Axios 只存在于 `frame/request/transport.ts`。应用 API 通过不可变 Endpoint 绑定，页面使用 `useApi()`，不接触 Axios 类型或实例。
- Zod 校验 LocalStorage、外部 Route Node 和 Admin API JSON 响应。Vite 开发代理地址由 `web/.env*` 提供，并在 Vite 配置加载时校验。
- TanStack Query 管理服务器资源、轮询以及 mutation 后的查询失效，不承载客户端状态。
- Tailwind CSS 4、CSS Variables，以及基于 Base UI (`base-nova`) 的 shadcn/ui 组件。公共 UI 源码位于 `frame/components/ui`。

## 依赖方向

`pages` 组合 `api`、`stores`、应用组件和 `frame`。`api`、`routes`、`stores` 可以依赖 `frame`；`frame` 不导入产品 API、页面、路由源或应用 store。Server 与 Web 不互相导入源码。

## API 与认证

Admin API 固定使用同源 `/admin/api/v1` 和 HttpOnly、SameSite=Strict 会话 Cookie。Request Client 不接受 API origin，生产产物也不包含可切换后端的运行时配置。成功响应直接解析为 Endpoint 对应的 Zod schema；错误响应解析为 `{ error: { code, message, requestId, details } }`，再映射为稳定的 `RequestError` 分类。

管理员密码和会话 Cookie 不写入浏览器存储。Zustand 仅保留当前管理员的非敏感摘要与凭据 revision；Server 始终是会话真源。服务没有 refresh token 端点，因此 401 不做伪刷新或隐式重试，而由受认证布局返回登录路由。

Web 添加文本或图片时调用 Admin API 创建清单、上传预览和 eager 完整内容，再完成发布。Server 将来源固定为虚拟 Server 设备；Web 不生成或持有该设备的 API Key。虚拟设备在设备设置中只读展示，不能编辑、禁用、删除或管理 Key。

设备设置先登记客户端生成的 DeviceId，再为该设备签发、轮换和吊销绑定 Key，并支持禁用和删除。名称与图标由客户端持有，客户端连接和资料变化时通过 Device API 主动同步；Web 只读展示这些资料，不提供编辑表单。

图片卡片最初只读取 Server 已有的缩略图。用户打开图片预览时，如果完整表示仍需来源设备，页面自动创建内容物化请求并轮询 transfer；完成后卡片与详情切换到 Server 保存的完整图片，并提供复制图片和下载操作。

## 路由与布局

`routes/base.ts` 定义登录、错误、404 与 catch-all；`routes/app.ts` 定义剪切板工作区和设置页面；`routes/user.ts` 使用 Zod 解析不可信扩展节点。根路径是主工作区，旧的概览、Channel、剪切板和传输路径做重定向。即使当前没有远程路由，组合根仍发布空用户路由，使 `ready` 只在完整路由图发布后成立。

组件 key 只映射到 `App.tsx` 的静态 lazy registry，页面按路由分包。`normal` 和 `empty` 布局通过 registry 注册；未知组件或布局不会回退到其他页面。开发环境显示诊断细节，生产环境只显示通用故障信息。

## 浏览器存储与主题

`frame/common/storage` 使用带版本、写入时间、可选过期时间和数据的信封；所有读取经过 Zod。当前只持久化主题偏好和可恢复的最近页面，不存储密码、Cookie、API Key 或内容正文。跨标签页采用 storage event，同页写入主动通知，冲突语义为最后写入者生效。

浅色、深色和系统主题由 Zustand theme store 管理，并统一切换根 `.dark` class。业务组件只消费语义 token。

## 打包边界与开发代理

- Web 不读取、解析或修改 `config.yaml`；该文件属于 Server。
- Web 不提供 API origin、Server host/port 或独立部署配置，Router basename 固定为 `/`。
- 根 `build.ts` 先执行 Vite 构建，再将 `web/dist` 与 Server 可执行文件共同交付。
- Vite 本地开发服务器使用 `3000` 端口，代理目标只来自 `web/.env*` 中不带 `VITE_` 前缀的 `CBX_PROXY_URL`。当前 Vite 配置加载时要求此变量，包括生产构建；它不会暴露到浏览器代码。管理员请求优先通过浏览器的 `Sec-Fetch-Site` 校验；若要兼容不发送该头的客户端，可在 Server 配置中显式设置浏览器访问 Vite 的 `web.public-origin`。

监听地址、数据库、对象目录、管理员、设备授权、Key 和 Channel 等配置只由 Server 使用 `yaml` 包解析，并由 Server 控制台负责原子回写。客户端维护的设备名称与图标属于 SQLite 运行数据，不进入 YAML。

## 当前范围

当前没有表单状态库、SSR、微前端、远程菜单和 keep-alive 页面缓存。引入这些能力需要独立的产品需求和架构决策。
