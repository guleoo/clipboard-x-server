import type { Node } from "@/frame/router/core"
import { i18n } from "@/frame/common/i18n"

export function application(): readonly Node[] {
  return [
    { id: "app.clipboard", name: "clipboard", path: "/", title: i18n.t("clipboard"), component: "clipboard", index: true, order: 10 },
    { id: "app.devices", name: "devices", path: "/devices", title: i18n.t("devices"), component: "devices", show: false },
    { id: "app.activity", name: "activity", path: "/activity", title: i18n.t("activity"), component: "transfers", show: false },
    { id: "app.account", name: "account", path: "/account", title: i18n.t("account"), component: "account", show: false },
    { id: "app.configuration", name: "configuration", path: "/configuration", title: i18n.t("configuration"), component: "configuration", show: false },
    { id: "legacy.retention", name: "legacy.retention", path: "/retention", title: i18n.t("configuration"), redirect: "/configuration", show: false },
    { id: "legacy.dashboard", name: "legacy.dashboard", path: "/dashboard", title: i18n.t("clipboard"), redirect: "/", show: false },
    { id: "legacy.channels", name: "legacy.channels", path: "/channels", title: i18n.t("clipboard"), redirect: "/", show: false },
    { id: "legacy.clipboard", name: "legacy.clipboard", path: "/clipboard", title: i18n.t("clipboard"), redirect: "/", show: false },
    { id: "legacy.transfers", name: "legacy.transfers", path: "/transfers", title: i18n.t("activity"), redirect: "/activity", show: false },
  ]
}
