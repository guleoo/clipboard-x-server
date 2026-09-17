import type { Node } from "@/frame/router/core"

export const application: readonly Node[] = [
  { id: "app.clipboard", name: "clipboard", path: "/", title: "剪切板", component: "clipboard", index: true, order: 10 },
  { id: "app.devices", name: "devices", path: "/devices", title: "设备", component: "devices", show: false },
  { id: "app.activity", name: "activity", path: "/activity", title: "活动", component: "transfers", show: false },
  { id: "app.account", name: "account", path: "/account", title: "账户", component: "account", show: false },
  { id: "app.retention", name: "retention", path: "/retention", title: "保留策略", component: "retention", show: false },
  { id: "legacy.dashboard", name: "legacy.dashboard", path: "/dashboard", title: "剪切板", redirect: "/", show: false },
  { id: "legacy.channels", name: "legacy.channels", path: "/channels", title: "剪切板", redirect: "/", show: false },
  { id: "legacy.clipboard", name: "legacy.clipboard", path: "/clipboard", title: "剪切板", redirect: "/", show: false },
  { id: "legacy.transfers", name: "legacy.transfers", path: "/transfers", title: "活动", redirect: "/activity", show: false },
]
