export type Layout = "normal" | "empty"

export interface Node {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly title: string
  readonly component?: string | undefined
  readonly redirect?: string | undefined
  readonly layout?: Layout | undefined
  readonly index?: boolean | undefined
  readonly order?: number | undefined
  readonly show?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly flat?: boolean | undefined
  readonly keepAlive?: boolean | undefined
  readonly parentId?: string | undefined
  readonly children?: readonly Node[] | undefined
}

export type Target =
  | { readonly kind: "component"; readonly component: string }
  | { readonly kind: "redirect"; readonly redirect: string }

export interface CompiledMenuConfig {
  readonly title: string
  readonly order: number
  readonly show: boolean
  readonly disabled: boolean
  readonly flat: boolean
}

export interface CompiledRouteConfig {
  readonly name: string
  readonly path: string
  readonly layout: Layout
  readonly index: boolean
  readonly keepAlive: boolean
  readonly target?: Target
}

export interface CompiledNode {
  readonly id: string
  readonly parentId?: string
  readonly menu: CompiledMenuConfig
  readonly route: CompiledRouteConfig
  readonly children: readonly CompiledNode[]
}

export interface Menu {
  readonly id: string
  readonly title: string
  readonly path?: string
  readonly order: number
  readonly disabled: boolean
}

export interface Route {
  readonly id: string
  readonly path: string
  readonly layout: Layout
  readonly target: Target
}

export interface Snapshot {
  readonly nodes: readonly CompiledNode[]
  readonly menus: readonly Menu[]
  readonly routes: readonly Route[]
  readonly removedPaths: readonly string[]
}
