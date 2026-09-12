import type { CompiledNode, Layout, Menu, Node, Route, Snapshot, Target } from "./types"

interface Source extends Node { readonly inheritedParentId?: string }

function normalize(path: string): string {
  if (path.includes("?") || path.includes("#") || path.includes("\\") || path.includes("..")) {
    throw new Error(`无效路由路径：${path}`)
  }
  const wildcard = path.endsWith("/*")
  const body = path.replace(/\/+/gu, "/").replace(/\/$/u, "") || "/"
  if (!body.startsWith("/")) throw new Error(`根路由必须使用绝对路径：${path}`)
  return wildcard && body !== "/*" ? `${body}/*` : body
}

function join(parent: string, child: string): string {
  if (child.startsWith("/")) return normalize(child)
  if (child === "") return parent
  return normalize(`${parent === "/" ? "" : parent}/${child}`)
}

function target(node: Node): Target | undefined {
  if (node.component && node.redirect) throw new Error(`路由 ${node.id} 不能同时声明 component 和 redirect`)
  if (node.component) return { kind: "component", component: node.component }
  if (node.redirect) return { kind: "redirect", redirect: normalize(node.redirect) }
  return undefined
}

function flatten(nodes: readonly Node[], parentId?: string): Source[] {
  const result: Source[] = []
  for (const node of nodes) {
    const { children: _children, ...source } = node
    result.push({ ...source, ...(parentId === undefined ? {} : { inheritedParentId: parentId }) })
    result.push(...flatten(node.children ?? [], node.id))
  }
  return result
}

function freeze<NodeValue>(value: NodeValue): NodeValue {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

export class Engine {
  static create(nodes: readonly Node[] = []): Engine { return new Engine(nodes) }

  private snapshot: Snapshot = freeze({ nodes: [], menus: [], routes: [], removedPaths: [] })
  private listeners = new Set<(snapshot: Snapshot) => void>()

  private constructor(nodes: readonly Node[]) { this.replace(nodes) }

  get(): Snapshot { return this.snapshot }

  replace(nodes: readonly Node[]): Snapshot {
    const sources = flatten(nodes)
    const byId = new Map<string, Source>()
    for (const source of sources) {
      if (byId.has(source.id)) throw new Error(`路由 id 重复：${source.id}`)
      byId.set(source.id, source)
    }

    const paths = new Map<string, string>()
    const layouts = new Map<string, Layout>()
    const resolving = new Set<string>()
    const resolve = (source: Source): { path: string; layout: Layout; parentId?: string } => {
      const knownPath = paths.get(source.id)
      const knownLayout = layouts.get(source.id)
      if (knownPath && knownLayout) return { path: knownPath, layout: knownLayout, ...(source.parentId ?? source.inheritedParentId ? { parentId: source.parentId ?? source.inheritedParentId } : {}) }
      if (resolving.has(source.id)) throw new Error(`路由父级存在循环：${source.id}`)
      resolving.add(source.id)
      const parentId = source.parentId ?? source.inheritedParentId
      const parent = parentId ? byId.get(parentId) : undefined
      if (parentId && !parent) throw new Error(`路由父级不存在：${source.id} -> ${parentId}`)
      const parentValue = parent ? resolve(parent) : undefined
      const path = parentValue ? join(parentValue.path, source.path) : normalize(source.path)
      const layout = source.layout ?? parentValue?.layout ?? "normal"
      resolving.delete(source.id)
      paths.set(source.id, path)
      layouts.set(source.id, layout)
      return { path, layout, ...(parentId === undefined ? {} : { parentId }) }
    }

    const names = new Set<string>()
    const matchablePaths = new Set<string>()
    const compiledById = new Map<string, CompiledNode>()
    for (const source of sources) {
      if (names.has(source.name)) throw new Error(`路由 name 重复：${source.name}`)
      names.add(source.name)
      const resolved = resolve(source)
      const routeTarget = target(source)
      if (routeTarget && matchablePaths.has(resolved.path)) throw new Error(`可匹配路径重复：${resolved.path}`)
      if (routeTarget) matchablePaths.add(resolved.path)
      compiledById.set(source.id, {
        id: source.id,
        ...(resolved.parentId === undefined ? {} : { parentId: resolved.parentId }),
        menu: {
          title: source.title,
          order: source.order ?? 255,
          show: source.show ?? true,
          disabled: source.disabled ?? false,
          flat: source.flat ?? false,
        },
        route: {
          name: source.name,
          path: resolved.path,
          layout: resolved.layout,
          index: source.index ?? false,
          keepAlive: source.keepAlive ?? false,
          ...(routeTarget === undefined ? {} : { target: routeTarget }),
        },
        children: [],
      })
    }

    const root: CompiledNode[] = []
    for (const node of compiledById.values()) {
      if (node.parentId) (compiledById.get(node.parentId)!.children as CompiledNode[]).push(node)
      else root.push(node)
    }
    const compiled = [...compiledById.values()]
    const routes: Route[] = compiled.flatMap((node) => node.route.target ? [{
      id: node.id,
      path: node.route.path,
      layout: node.route.layout,
      target: node.route.target,
    }] : [])
    const indexed = new Map<string, string>()
    for (const node of compiled.filter((value) => value.route.index)) {
      const scope = node.parentId ?? `layout:${node.route.layout}`
      if (indexed.has(scope)) throw new Error(`同一路由范围存在多个默认入口：${scope}`)
      indexed.set(scope, node.id)
    }
    const clickable = (node: CompiledNode): string | undefined => {
      if (node.route.target) return node.route.path
      const entry = node.children.find((child) => child.route.index)
      return entry ? clickable(entry) : undefined
    }
    const menus: Menu[] = compiled
      .filter((node) => node.menu.show)
      .map((node) => {
        const path = clickable(node)
        return { id: node.id, title: node.menu.title, order: node.menu.order, disabled: node.menu.disabled, ...(path === undefined ? {} : { path }) }
      })
      .sort((left, right) => left.order - right.order)
    const nextPaths = new Set(routes.map((route) => route.path))
    const removedPaths = this.snapshot.routes.map((route) => route.path).filter((path) => !nextPaths.has(path))
    this.snapshot = freeze({ nodes: root, routes, menus, removedPaths })
    for (const listener of this.listeners) listener(this.snapshot)
    return this.snapshot
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
