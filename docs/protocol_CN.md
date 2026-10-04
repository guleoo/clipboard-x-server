# Clipboard X 同步协议（HTTP API v1）

> 规范版本：v1 · 文档语言：简体中文 · [English](protocol.md)

本文是 Clipboard X Server 与所有设备客户端之间的权威人类可读协议。协议不依赖桌面环境、
操作系统、UI 工具包或某一个客户端实现。

协议版本按照 `v{n}` 迭代，并与接口路径中的版本一致：`v1` 对应 `/api/v1` 和
`/admin/api/v1`。协议版本独立于 Server 的软件发布版本。

## 先看这里

Server 保存设备身份、Channel 成员关系、剪切板元数据、预览及已上传的内容。少量文本通常完整
上传；长文本和图片可以先发布较小的预览，只有实际需要时才从来源设备取回原文。新加入的设备
读取 Server 保留的 Channel 历史，而不只是加入后的新变化。

设备的典型工作过程：

1. 生成并持久化 UUID v4 **DeviceId**。管理员登记它，签发对应的 API Key，并将它加入
   **Channel**（共享剪切板条目的设备分组）。
2. 获取 Server 版本与限制，更新设备的友好名称和图标。
3. 发布一个 **item**（一次剪切板事件）：先提交描述内容的 **manifest**（清单），再上传
   Server 指定的字节，最后完成上传。完成前，其他设备看不到这个条目。
4. 用持久化的 **cursor** 读取 Channel **changes**（变化），按需获取条目详情和较小的
   **preview**（预览）。cursor 是不透明书签，客户端不能解析或自行构造。
5. 用户需要懒加载原文时发起请求。来源设备收到 **work**（工作项）并上传原文；双方用
   **transfer**（传输记录）查看进度和失败原因。

下方示例展示关键字段；`"item UUID"`、`"64 lowercase hex characters"` 等是值的占位说明，
**不能直接作为请求值发送**。按本文的字段表和示例完成接入；熟悉流程后可使用末尾的
[端点索引](#端点索引)查找路径。

## 权威来源与演进

协议由 Clipboard X Server 负责制定。**开发客户端时直接阅读本文**：它按照设备的实际使用
顺序解释请求、响应、状态变化和恢复规则。Server 生成的
[`OpenAPI 规范`](../server/openapi/openapi.json) 是供代码生成器和精确 Schema 查询使用的
辅助机器可读资料，不是阅读本文的前置条件。本文、OpenAPI 与 Server 实际行为不一致时，
视为发布缺陷。

通过 Server 路由和 DTO Schema 重新生成并校验 OpenAPI：

```sh
bun run --filter '@clipboard-x/server' openapi
bun run openapi:check
```

客户端实现 Server 已发布的 API 版本，而不反向定义协议。`/api/v1` 可以增加可选响应字段和
新端点，客户端必须忽略未知响应字段。删除或重命名字段、把可选字段改为必填，或者改变既有
状态与操作语义，必须发布 `/api/v2` 等新的主版本路径。

## 1. 基本约定

- 所有端点位于用户配置地址下的 `/api/v1`；配置地址可以包含反向代理前缀。
- 用户可以填写 `IP:端口`、`http://` 或 `https://` 地址；未写 scheme 时客户端补
  `http://`，不擅自把 HTTP 改成 HTTPS。
- 除协议另有说明外，请求和响应使用 UTF-8 JSON，字段采用 `camelCase`。
- 每个设备 API 请求都携带 `Authorization: Bearer <API key>` 和
  `X-Clipboard-X-Device-Id: <UUID v4>`。服务器必须校验 API Key 属于该 DeviceId。
- DeviceId 是唯一身份和路由键，不是认证凭据。Device Tag 只在设备资料更新时发送，
  不附加在每个请求中。
- 时间字段为 Unix epoch 毫秒；字节数为未压缩原始内容的逻辑字节数。
- `cursor` 是服务器生成的不透明字符串。客户端只保存和回传，不解析其内容。

错误响应使用：

```json
{
  "error": {
    "code": "invalid_key",
    "message": "Device API key is invalid",
    "requestId": "request-id",
    "details": {}
  }
}
```

客户端必须限制 JSON、错误正文、预览和完整内容的最大读取量，并校验 UUID、MIME、大小
与 SHA-256。未知字段可忽略；缺少必需字段或字段非法时必须拒绝整条响应。

程序应依据 `error.code` 分支处理；`message` 用于展示或诊断，`requestId` 用于定位 Server 日志。
常见结果：

| HTTP 状态 / 错误码 | 客户端应该怎么做 |
| --- | --- |
| `400 invalid_request` | 修正请求或丢弃非法 cursor；不要原样无限重试。 |
| `401 invalid_key` | 提示用户配置有效的设备 Key。 |
| `403 device_mismatch`、`channel_forbidden`、`device_disabled` | 检查身份或 Channel 成员关系；配置变化前不要重试。 |
| `404 not_found` | 条目、对象或工作项已不存在。 |
| `409 item_conflict` | ItemId 被用于不同内容或已删除的条目；创建新的 ItemId。 |
| `409 content_not_ready` | 等待物化传输完成，再下载原文。 |
| `410 transfer_expired` | 重新开始上传或内容请求。 |
| `413 too_large` | 缩小条目、内容表示或预览的体积。 |
| `429 rate_limited` | 使用有上限的退避后重试。 |

Server 故障也可能返回 `500 internal_error`；保留 `requestId`，但不要在日志中输出剪切板正文或
API Key。各接口正常返回时的状态码见下文。

## 2. 设备端流程

下面按照设备通常发起请求的顺序介绍各接口。设备端点都以 `/api/v1` 开头，并使用上述两个
认证请求头。

### 2.1 获取状态

`GET /api/v1/status`

返回协议版本、服务器版本、当前状态和能力限制：

```json
{
  "apiVersion": 1,
  "serverVersion": "<server release version>",
  "state": "online",
  "capabilities": {
    "supportedMimeTypes": ["text/plain;charset=utf-8", "image/png"],
    "maxItemBytes": 268435456,
    "maxPreviewBytes": 1048576
  },
  "pendingItems": 0,
  "activeTransfers": 0,
  "lastSyncAt": 0,
  "revision": 1
}
```

`apiVersion` 必须等于 `1`，表示协议 `v1`。`serverVersion` 返回当前运行的 Server 发布版本，
示例使用占位说明。`state` 为 `online` 或 `degraded`。

| 字段 | 客户端如何使用 |
| --- | --- |
| `apiVersion` | 不支持时拒绝同步；与 `serverVersion` 是不同概念。 |
| `capabilities.supportedMimeTypes` | 只发布 Server 支持的内容格式。 |
| `capabilities.maxItemBytes` | 限制同一条目中所有原始内容的总字节数。 |
| `capabilities.maxPreviewBytes` | 限制每个预览；Server 还会执行独立的单对象大小限制。 |
| `pendingItems`、`activeTransfers`、`lastSyncAt`、`revision` | 全局诊断指标，不能当作变化流 cursor。 |

### 2.2 获取和更新设备信息

- 客户端连接前，管理员先登记客户端生成的 DeviceId，并签发绑定到该 DeviceId 的 API Key。
- `GET /api/v1/device`：获取当前 API Key 对应的设备资料和状态。
- `PUT /api/v1/device/profile`：更新客户端维护的友好资料，请求体为
  `{"tag":"工作电脑","iconKind":"archlinux"}`。

设备响应：

```json
{
  "id": "UUID",
  "tag": "工作电脑",
  "iconKind": "archlinux",
  "iconColor": {"light": "#ffffff"},
  "state": "online",
  "lastSeenAt": 1787620000000,
  "createdAt": 1787610000000,
  "updatedAt": 1787620000000,
  "kind": "client"
}
```

`iconKind` 是非空纯文本图标标识，最长 128 个字符，不包含回车、换行和 NUL。
服务端原样保存并返回该字符串，不传输图片或 SVG；各客户端自行映射本地图标，无法识别时
显示通用图标。
资料请求可以省略 `iconColor`，此时服务端存储白色。提供该对象时，`light` 是必需的
小写 `#RRGGBB`；`dark` 可选。省略 `dark` 表示客户端由亮色自动计算暗色，提供 `dark`
则保留指定的暗色。响应始终包含 `iconColor`，自动派生的暗色不出现在响应中。亮色用于深色背景，
暗色用于浅色背景。
联动计算规则：将亮色拆为 RGB 通道，取最大通道值 `maximum`；各通道乘以
`min(1, 96 / maximum)`（当最大值为 `0` 时取 `1`），四舍五入至整数，格式化为小写
`#RRGGBB`。因此 `#ffffff` 对应 `#606060`。客户端本地计算，服务端不存储计算结果。

`GET /api/v1/device` 与 `PUT` 的响应都返回上述资料。`tag` 是易读名称；`iconKind` 是由客户端
自行解释的标识，不是固定枚举。普通设备的 `kind` 为 `client`，Server 发布的条目来源为
`virtual`。`lastSeenAt`、`createdAt` 和 `updatedAt` 都是 epoch 毫秒；`state` 表示可用性
（`online`、`offline`、`disabled` 或 `unavailable`）。禁用的设备无法认证。更新资料时同时
提交 `tag`（1–256 个字符）和 `iconKind`；`iconColor` 可选。每次发布剪切板条目时无需重复
提交设备资料。

### 2.3 选择 Channel

`GET /api/v1/channels` 返回当前设备已加入的 Channel（**200**）：

```json
{
  "channels": [{
    "id": "UUID",
    "name": "家庭",
    "createdAt": 1787610000000,
    "updatedAt": 1787620000000
  }]
}
```

设备只能读写其所属 Channel。客户端在本地选择活动 Channel，并为每个 Channel 分别保存变化流
cursor。列表为空表示管理员尚未把设备加入 Channel，设备此时不能发布或读取条目。

### 2.4 推送剪切板内容

`POST /api/v1/channels/{channelId}/items`

第一阶段只提交不可变清单，不把二进制编码进 JSON：

```json
{
  "id": "item UUID",
  "createdAt": 1787620000000,
  "originDeviceId": "device UUID",
  "contents": [{
    "id": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 123,
    "sha256": "64 lowercase hex characters",
    "delivery": "eager"
  }],
  "previews": [{
    "id": "preview-id",
    "contentId": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 80,
    "sha256": "64 lowercase hex characters",
    "truncated": true
  }]
}
```

`delivery=eager` 表示创建条目时上传完整内容；`on-demand` 表示先同步清单和预览，等远端
真正使用时再向来源设备取回。

少量文本建议使用 `eager`；长文本、图片或其他受支持的格式可使用 `on-demand`。具体哪些内容懒加载由
客户端决定，但不得超出 Server 的大小限制。每条内容的 `size` 与 `sha256` 描述的是**完整
原始字节**，不是预览。预览有自己的 ID、MIME、大小、摘要和 `truncated` 标记，并通过
`contentId` 关联原文。

| 清单字段 | 含义 |
| --- | --- |
| `id` | 客户端生成的 UUID v4 ItemId；重试时保持不变。 |
| `createdAt` | 条目创建时的 epoch 毫秒时间戳。 |
| `originDeviceId` | 必须与当前认证设备的 DeviceId 相同。 |
| `contents` | 1–16 个内容表示；每个都有唯一 `id`、MIME、字节数、SHA-256 和 `delivery`。 |
| `previews` | 0–16 个较小的预览；每个都有唯一 `id`，并引用已有的 `contentId`。 |

`POST` 返回 **201**、上传会话以及仍需上传的对象 ID：

```json
{
  "itemId": "item UUID",
  "uploadId": "upload UUID",
  "previewIds": ["preview-id"],
  "contentIds": ["content-id"],
  "transfer": {
    "id": "transfer UUID",
    "itemId": "item UUID",
    "deviceId": "device UUID",
    "kind": "publish",
    "direction": "upload",
    "state": "queued",
    "completedBytes": 0,
    "totalBytes": 203,
    "peerDeviceIds": [],
    "createdAt": 1787620000000,
    "updatedAt": 1787620000000,
    "error": {"code": "", "message": ""}
  }
}
```

`previewIds` 和 `contentIds` 只列出 Server 仍需上传的对象。空数组可能表示发布已完成。
对于被请求的对象，客户端依次流式调用：

- `PUT /api/v1/uploads/{uploadId}/previews/{previewId}`
- `PUT /api/v1/uploads/{uploadId}/contents/{contentId}`
- `POST /api/v1/uploads/{uploadId}/complete`

PUT 正文就是原始字节流，`Content-Type` 使用清单 MIME，`Content-Length` 必须与清单一致。
服务器边读边计算大小和 SHA-256；每次 PUT 成功返回 **200** 和
`{ "size": number, "sha256": "..." }`。最后调用 `POST .../complete`（**200**），收到
`{ "transfer": ... }`。校验失败或缺少对象时不能发布条目。使用同一份清单重复提交 ItemId、
重复发送已上传的对象或重复完成上传都是安全的；不能使用原有 ItemId 提交不同的清单。
无需上传时，Server 可以直接返回 `completed` 传输。

### 2.5 同步剪切板内容

1. `GET /api/v1/channels/{channelId}/changes?cursor=...&limit=200` 获取增量变化。
2. 对 `upsert` 调用 `GET /api/v1/channels/{channelId}/items/{itemId}` 获取清单。
3. 用 `GET .../previews/{previewId}` 获取限量预览。
4. 只有用户真正复制、粘贴、保存或编辑时，才为 `on-demand` 内容发起物化请求。

客户端浏览或搜索 Server 保留的历史时，也可以调用：

`GET /api/v1/channels/{channelId}/items?cursor=...&limit=100&query=...`

响应包含 `items`、不透明的下一页 `cursor` 和 `hasMore`。这里的**列表 cursor 与变化流 cursor
不同**，不能混用，也不能互相推算。不带变化流 cursor 会从仍保留的变化历史起点读取，包含设备
加入 Channel 以前的变化。如需为 Channel 中的所有成员删除
条目，调用 `DELETE /api/v1/channels/{channelId}/items/{itemId}`。只删除客户端本地历史时
不得调用该端点。

变化页结构：

```json
{
  "cursor": "opaque-next-cursor",
  "hasMore": false,
  "changes": [{
    "sequence": 18,
    "kind": "upsert",
    "itemId": "item UUID",
    "reason": ""
  }]
}
```

`kind` 为 `upsert` 或 `remove`。对 `upsert` 获取条目；对 `remove` 从本地同步视图移除
对应的 Server 条目。只有完整处理一页后，才持久化本页的**变化流** cursor。
`hasMore=true` 时继续取下一页，并校验 cursor 已推进，避免死循环。空的 `changes` 页也可能
包含需要保存的有效 cursor。

获取条目返回 **200**，包含所在 Channel、来源设备、内容清单和每个内容当前的
`availability`：

```json
{
  "id": "item UUID",
  "channelId": "channel UUID",
  "channelName": "家庭",
  "createdAt": 1787620000000,
  "updatedAt": 1787620000000,
  "origin": {
    "deviceId": "UUID",
    "tag": "手机",
    "iconKind": "android",
    "iconColor": {"light": "#ffffff"},
    "kind": "client"
  },
  "contents": [{
    "id": "content-id",
    "mimeType": "text/plain;charset=utf-8",
    "size": 123,
    "sha256": "64 lowercase hex characters",
    "delivery": "eager",
    "availability": "available"
  }],
  "previews": []
}
```

`origin.kind=virtual` 表示由 Server 网页控制台发布。`contents[].availability` 表示原文
已经 `available`，或仍处于 `source-required`、`requesting`、`expired`、`failed`。
预览的 `truncated` 指示原文是否比预览更长。预览存在时，调用
`GET /api/v1/channels/{channelId}/items/{itemId}/previews/{previewId}` 下载（**200**，二进制）。
响应提供 `Content-Type`、`Content-Length` 和 `X-Content-Sha256`，客户端应与清单比对
通过后再展示或保存预览。不要为了填充历史列表就下载大体积原文。

## 3. 传输与精确进度

所有上传和按需物化都有 UUID `transfer.id`：

```json
{
  "id": "transfer UUID",
  "itemId": "item UUID",
  "deviceId": "device UUID",
  "kind": "publish",
  "direction": "upload",
  "state": "transferring",
  "completedBytes": 65536,
  "totalBytes": 1048576,
  "peerDeviceIds": [],
  "createdAt": 1787620000000,
  "updatedAt": 1787620000100,
  "error": {"code":"","message":""}
}
```

| 传输字段 | 含义 |
| --- | --- |
| `id`、`itemId`、`deviceId` | 传输 ID、条目 ID 和传输对应的设备。 |
| `kind` | 新条目发布为 `publish`，请求原文为 `content`。 |
| `direction` | 从此设备视角看，是 `upload` 还是 `download`。 |
| `state` | 见下表；只有终态才停止轮询。 |
| `completedBytes`、`totalBytes` | 已处理字节数必须在 `[0,totalBytes]` 内；`completed` 时相等。 |
| `peerDeviceIds` | 涉及或预期接收此次传输的设备。 |
| `createdAt`、`updatedAt`、`error` | 时间戳、机器可读失败码和展示消息。 |

| 状态 | 含义 |
| --- | --- |
| `queued` | 已建立任务，尚未开始传输。 |
| `waiting-for-peer` | Server 尚无原文，等待来源设备处理工作项。 |
| `transferring` | 正在传输字节。 |
| `verifying` | 已接收的内容正在校验或提交。 |
| `completed` | Server 端已完成，请求方可以下载可用的原文。 |
| `failed`、`cancelled`、`expired` | 失败、主动取消或超时，均为终态。 |

管理端点：

- `GET /api/v1/transfers`：恢复当前设备最近的传输，返回 `{ "transfers": [ ... ] }`。
- `GET /api/v1/transfers/{transferId}`：轮询一条传输，返回该传输对象。
- `DELETE /api/v1/transfers/{transferId}`：请求取消，返回更新后的传输对象。

上传进度由实际写入 HTTP 请求体的字节数计算。等待来源设备与来源设备上传的阶段可轮询
Server transfer。**Server transfer 显示 `completed`，不代表请求设备已下载完成**：最后这段
进度应由客户端下载并写入本地临时存储的字节数计算。核对大小和 SHA-256 后，才写入本地
剪切板或对象仓库。UI 刷新频率可以限制，但不能降低字节计数精度。

## 4. 按需内容物化

请求设备调用（返回 **202**、`{ "transfer": ... }`）：

`POST /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}/requests`

Server 若已有完整原文，transfer 可直接为 `completed`。否则为 `waiting-for-peer`；即使多个
设备请求同一份原文，Server 也只为来源设备创建一份工作，但每个请求方仍有自己的 transfer。
来源设备轮询：

`GET /api/v1/work?cursor=...&limit=100`

```json
{
  "cursor": "opaque-work-cursor",
  "hasMore": false,
  "work": [{
    "id": "work UUID",
    "type": "materialize-content",
    "itemId": "item UUID",
    "contentId": "content-id"
  }]
}
```

`work` 数组只包含排队中的工作项。即使数组为空也要保存本页 cursor，因为它可能已跨过
接受或拒绝的工作。来源设备找不到本地对象时调用
`POST /api/v1/work/{workId}/reject`，正文为 `{"code":"source_content_missing","message":""}`
（**204**，无响应正文）。另两个拒绝码为 `upload_failed` 和 `cancelled`。能够提供时调用
`POST /api/v1/work/{workId}/accept`（**200**），取得
`{ "uploadId": "...", "transfer": ... }`，再通过
`PUT /api/v1/uploads/{uploadId}/contents/{contentId}` 上传，并调用
`POST /api/v1/uploads/{uploadId}/complete` 完成。

请求方的 transfer 完成后，调用
`GET /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}` 流式下载
（**200**，二进制），将 `Content-Type`、`Content-Length` 和 `X-Content-Sha256` 与清单
比对，再校验实际下载的字节。原文尚未准备好时下载返回 `409 content_not_ready`。
服务器网页查看完整内容也必须走同一套按需物化流程，不要求永久缓存所有大内容。

## 5. 客户端职责与恢复

- 为每个 Channel 分别保存 changes cursor，同时保存 work cursor；只有整页处理完成后才能
  原子持久化对应 cursor。
- 同步开启期间轮询 changes、work 和未完成传输。5 秒是合理默认值；失败后应采用有上限的退避。
- 同步关闭或连接配置发生变化时，取消未完成的 HTTP 请求和计时器。协议不要求设备心跳或
  常驻本机 Service。
- 只要客户端仍声明自己能够提供 `on-demand` 对象，就必须保留本机原始内容。进程重启后，
  应通过持久化清单和 cursor 按幂等语义恢复工作。
- 使用 ItemId、内容哈希和程序化写入记录抑制剪切板回环，不能为此修改同步正文。
- 分配内存前限制所有 JSON 和二进制流；大对象必须流式处理，校验大小和 SHA-256，并原子提交。

## 6. 管理端接口

管理员端点位于 `/admin/api/v1`，使用 HttpOnly、SameSite=Strict Session Cookie，
与设备 API 分开。修改操作必须来自同源请求。网页控制台通常使用以下接口：

| 任务 | 端点 | 作用 |
| --- | --- | --- |
| 登录、查询会话、登出 | `POST`、`GET`、`DELETE /admin/api/v1/session` | 基于 Cookie 的管理员会话。 |
| 注册和管理设备 | `GET`、`POST /admin/api/v1/devices`；`PATCH`、`DELETE /admin/api/v1/devices/{deviceId}` | 先注册客户端生成的 DeviceId，再签发 Key。 |
| 签发或撤销 Key | `POST /admin/api/v1/devices/{deviceId}/keys`；`DELETE /admin/api/v1/devices/{deviceId}/keys/{keyId}` | 一个 Key 只绑定一个设备。 |
| 创建和管理 Channel | `GET`、`POST /admin/api/v1/channels`；`PATCH`、`DELETE /admin/api/v1/channels/{channelId}` | 管理名称及成员关系。 |
| 添加或移除成员 | `PUT`、`DELETE /admin/api/v1/channels/{channelId}/members/{deviceId}` | 控制设备是否有权读写此 Channel。 |
| 查看或删除条目 | `GET /admin/api/v1/items`，`GET`、`DELETE /admin/api/v1/items/{itemId}` | Server 全局视图和删除，不影响设备的本地历史。 |
| 查看懒加载原文 | `/admin/api/v1/items/{itemId}` 下的 `GET .../previews/{previewId}`、`POST .../contents/{contentId}/requests`、`GET .../contents/{contentId}` | 同样经由来源设备 work 完成物化。 |
| 查看传输 | `GET /admin/api/v1/transfers`，`GET`、`DELETE /admin/api/v1/transfers/{transferId}` | 查看全局传输和请求取消。 |
| 查看概览或清理策略 | `GET /admin/api/v1/overview`；`GET`、`PATCH /admin/api/v1/configuration/cleanup` | 运维状态和数据保留策略。 |

Server 拥有一个不可变的虚拟设备，它固定加入每个 Channel，没有设备 API Key，也不能轮询
设备 changes 或 work。Web 控制台以该身份发布内容，并通过普通 Channel change feed 送达
真实设备。

管理员发布采用两阶段上传：

```text
POST /admin/api/v1/channels/{channelId}/items
PUT  /admin/api/v1/uploads/{uploadId}/previews/{previewId}
PUT  /admin/api/v1/uploads/{uploadId}/contents/{contentId}
POST /admin/api/v1/uploads/{uploadId}/complete
```

管理员清单不包含 `originDeviceId`，由 Server 指定虚拟设备。所有 representation 都使用
`delivery: eager`，因为虚拟设备不会处理后续物化任务。

## 7. 客户端兼容性检查表

兼容的设备客户端必须：

1. 在注册前生成并持久化 UUID v4 DeviceId；
2. 每次设备请求都发送绑定的 API Key 与 DeviceId；
3. 开始同步前拒绝不支持的 `apiVersion`；
4. 把 cursor 当作不透明值，并在 `hasMore=true` 时检测 cursor 未推进的错误；
5. 实现清单优先发布、流式上传，以及大小和 SHA-256 校验；
6. 保持 `on-demand` 懒加载语义，并处理自己来源内容的物化工作；
7. 保证重试幂等，并在重启后恢复未完成传输；
8. 忽略未知响应字段，同时拒绝缺失或非法的必需字段。

## 端点索引

```text
GET    /api/v1/status
GET    /api/v1/device
PUT    /api/v1/device/profile
GET    /api/v1/channels
POST   /api/v1/channels/{channelId}/items
GET    /api/v1/channels/{channelId}/items
GET    /api/v1/channels/{channelId}/changes
GET    /api/v1/channels/{channelId}/items/{itemId}
DELETE /api/v1/channels/{channelId}/items/{itemId}
GET    /api/v1/channels/{channelId}/items/{itemId}/previews/{previewId}
POST   /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}/requests
GET    /api/v1/channels/{channelId}/items/{itemId}/contents/{contentId}
PUT    /api/v1/uploads/{uploadId}/previews/{previewId}
PUT    /api/v1/uploads/{uploadId}/contents/{contentId}
POST   /api/v1/uploads/{uploadId}/complete
GET    /api/v1/work
POST   /api/v1/work/{workId}/accept
POST   /api/v1/work/{workId}/reject
GET    /api/v1/transfers
GET    /api/v1/transfers/{transferId}
DELETE /api/v1/transfers/{transferId}
```
