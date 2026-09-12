import { createStore, type StoreApi } from "zustand/vanilla"
import { Engine, type Node, type Snapshot } from "@/frame/router/core"
import { application, base } from "@/routes"

export interface State extends Snapshot {
  readonly ready: boolean
  readonly error: Error | undefined
}

export interface Store {
  readonly state: StoreApi<State>
  publishUser(nodes: readonly Node[]): void
}

export function create(): Store {
  const engine = Engine.create([...base, ...application])
  const state = createStore<State>(() => ({ ...engine.get(), ready: false, error: undefined }))
  engine.subscribe((snapshot) => state.setState((current) => ({ ...snapshot, ready: current.ready })))
  return {
    state,
    publishUser(nodes) {
      try {
        const snapshot = engine.replace([...base, ...application, ...nodes])
        state.setState({ ...snapshot, ready: true, error: undefined })
      } catch (cause) {
        state.setState((current) => ({ ...current, ready: true, error: cause instanceof Error ? cause : new Error("路由发布失败", { cause }) }))
      }
    },
  }
}

export const RouterStore = { create }
