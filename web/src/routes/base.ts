import type { Node } from "@/frame/router/core"

export const base: readonly Node[] = [
  { id: "base.login", name: "login", path: "/login", title: "登录", layout: "empty", component: "login", show: false },
  { id: "base.error", name: "error", path: "/error", title: "应用错误", layout: "empty", component: "error", show: false },
  { id: "base.not-found", name: "not-found", path: "/not-found", title: "页面不存在", layout: "empty", component: "not-found", show: false },
  { id: "base.catch-all", name: "catch-all", path: "/*", title: "未匹配路径", layout: "empty", redirect: "/not-found", show: false },
]
