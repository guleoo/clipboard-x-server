import type { Node } from "@/frame/router/core"

export const application: readonly Node[] = [
  { id: "app.dashboard", name: "dashboard", path: "/", title: "概览", component: "dashboard", index: true, order: 10 },
  { id: "app.devices", name: "devices", path: "/devices", title: "设备", component: "devices", order: 20 },
  { id: "app.channels", name: "channels", path: "/channels", title: "Channel", component: "channels", order: 30 },
  { id: "app.clipboard", name: "clipboard", path: "/clipboard", title: "剪切板", component: "clipboard", order: 40 },
  { id: "app.transfers", name: "transfers", path: "/transfers", title: "传输", component: "transfers", order: 50 },
  { id: "app.account", name: "account", path: "/account", title: "管理员", component: "account", order: 60 },
]
