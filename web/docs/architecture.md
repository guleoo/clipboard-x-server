# Clipboard X Web 架构

Web 管理端是单入口、纯客户端渲染的 React SPA。Bun 负责工作区依赖、脚本和测试，Vite 负责开发服务器与生产构建。应用组合根是 `src/App.tsx`，唯一浏览器入口是 `src/main.tsx`。生产构建生成 `web/dist`，根发布流程将它和 Server 可执行文件一起组装，由 Server 同源提供。

## 基础设施

- React 19、TypeScript 严格模式和 Vite。
- React Router Declarative Mode。`src/routes` 的扁平 Route Node 是唯一导航事实；`frame/router/core` 校验并编译节点，`Router.View` 建立唯一 `BrowserRouter`。
- Zustand 管理认证摘要、路由发布、最近页面和主题偏好。页面内交互状态仍由组件持有。
- Axios 只存在于 `frame/request/transport.ts`。应用 API 通过不可变 Endpoint 绑定，页面使用 `useApi()`，不接触 Axios 类型或实例。
- Zod 校验构建环境、LocalStorage、外部 Route Node 和全部 Admin API JSON 响应。
- TanStack Query 管理服务器资源，因为概览和传输需要轮询，设备、Channel、条目等 mutation 需要明确失效协调；它不承载客户端状态。
- Tailwind CSS 4、CSS Variables，以及 shadcn/ui 的 Base UI (`base-nova`) 组件。公共 UI 源码位于 `frame/components/ui`。

## 依赖方向

`pages` 组合 `api`、`stores`、应用组件和 `frame`。`api`、`routes`、`stores` 可以依赖 `frame`；`frame` 不导入任何产品 API、页面、路由源或应用 store。服务器与 Web 不互相导入源码。

## API 与认证

Admin API 固定使用同源 `/admin/api/v1` 和 HttpOnly、SameSite=Strict 会话 Cookie。Request Client 不接受 API origin，生产产物也不包含可切换后端的运行时配置。响应没有业务信封：成功响应直接解析为 Endpoint 对应的 Zod schema，错误响应解析为 `{ error: { code, message, requestId, details } }`，再映射为稳定的 `RequestError` 分类。

管理员密码和会话 Cookie 不写入浏览器存储。Zustand 仅保留当前管理员的非敏感摘要与凭据 revision；服务端始终是会话真源。服务没有 refresh token 端点，因此 401 不做伪刷新或隐式重试，而是由受认证布局返回登录 Route Node。

## 路由与布局

`routes/base.ts` 定义登录、错误、404 与 catch-all；`routes/app.ts` 定义管理页面；`routes/user.ts` 使用 Zod 解析不可信扩展节点。即使当前没有远程路由，组合根仍显式发布空用户路由，使 `ready` 只在完整图发布后成立。

组件 key 只映射到 `App.tsx` 的静态 lazy registry，页面按路由分包。`normal` 和 `empty` 布局通过 registry 注册；未知组件或布局不会回退到其他页面。开发环境显示诊断细节，生产环境只显示通用故障信息。

## 浏览器存储与主题

`frame/common/storage` 使用带版本、写入时间、可选过期时间和数据的信封；所有读取经过 Zod，损坏、过期或旧版本内容按契约处理。当前只持久化主题偏好和可恢复的最近页面，不存储密码、Cookie、API Key 或内容正文。跨标签页采用 storage event，同页写入主动通知，冲突语义为最后写入者生效。

浅色、深色和系统主题由 Zustand theme store 管理，并统一切换根 `.dark` class。业务组件只消费语义 token。

## 打包边界与开发代理

- Web 不读取、解析或修改 `config.yaml`；该文件完全属于 Server。
- Web 不提供 API origin、Server host/port 或独立部署配置，Router basename 固定为 `/`。
- 根 `build.ts` 先执行 Vite 构建，再将 `web/dist` 复制进发布目录，与 Server 可执行文件共同交付。
- Vite 的本地开发服务器固定使用 `3000`，并把 `/api`、`/admin/api` 代理到开发默认地址 `127.0.0.1:8787`。这只是源码开发约定，不写入生产 bundle，也不读取 Server 配置。

监听地址、数据库、对象目录、管理员、设备、Key、Channel 等配置只由 Server 使用 Bun 原生 YAML 能力解析，并由 Server 控制台负责原子回写。

## 有意省略

当前没有表单状态库、SSR、微前端、远程菜单和 keep-alive 页面缓存。表单规模尚不需要额外库；这些能力需要独立产品需求和架构决定后再沿现有边界扩展。
