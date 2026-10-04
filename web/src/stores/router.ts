import { createStore, type StoreApi } from "zustand/vanilla"
import { Engine, type Node, type Snapshot } from "@/frame/router/core"
import { application, base } from "@/routes"
import { LocalizedError } from "@/frame/common/error"

export interface State extends Snapshot {
  readonly ready: boolean
  readonly error: Error | undefined
}

export interface Store {
  readonly state: StoreApi<State>
  publishUser(nodes: readonly Node[]): void
  refresh(): void
}

export function create(): Store {
  const engine = Engine.create([...base(), ...application()])
  let user: readonly Node[] = []
  const state = createStore<State>(() => ({ ...engine.get(), ready: false, error: undefined }))
  engine.subscribe((snapshot) => state.setState((current) => ({ ...snapshot, ready: current.ready })))
  function publishUser(nodes: readonly Node[]) {
    try {
      const snapshot = engine.replace([...base(), ...application(), ...nodes])
      user = nodes
      state.setState({ ...snapshot, ready: true, error: undefined })
    } catch (cause) {
      state.setState((current) => ({ ...current, ready: true, error: cause instanceof Error ? cause : new LocalizedError("common:invalidRouter", {}, { cause }) }))
    }
  }
  return { state, publishUser, refresh: () => publishUser(user) }
}

export const RouterStore = { create }
