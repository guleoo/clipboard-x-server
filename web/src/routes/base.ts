import type { Node } from "@/frame/router/core"
import { i18n } from "@/frame/common/i18n"

export function base(): readonly Node[] {
  return [
    { id: "base.login", name: "login", path: "/login", title: i18n.t("login"), layout: "empty", component: "login", show: false },
    { id: "base.error", name: "error", path: "/error", title: i18n.t("renderError"), layout: "empty", component: "error", show: false },
    { id: "base.not-found", name: "not-found", path: "/not-found", title: i18n.t("notFound"), layout: "empty", component: "not-found", show: false },
    { id: "base.catch-all", name: "catch-all", path: "/*", title: i18n.t("unmatchedPath"), layout: "empty", redirect: "/not-found", show: false },
  ]
}
