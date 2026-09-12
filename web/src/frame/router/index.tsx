import { createContext, useContext, type ComponentType, type ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { useStore } from "zustand"
import type { Layout, Snapshot } from "./core"

interface RouterState extends Snapshot { readonly ready: boolean; readonly error: Error | undefined }
interface ReadonlyStore {
  getState(): RouterState
  getInitialState(): RouterState
  subscribe(listener: (state: RouterState, previousState: RouterState) => void): () => void
}
interface StoreBinding { readonly state: ReadonlyStore }
const Context = createContext<StoreBinding | undefined>(undefined)

export function useRouter() {
  const store = useContext(Context)
  if (!store) throw new Error("Router store is not available")
  return useStore(store.state)
}

function Failure({ detail }: { readonly detail: string }) {
  return <main className="grid min-h-screen place-items-center p-6"><section className="surface-raised max-w-lg p-6"><h1 className="font-semibold">页面无法显示</h1><p className="mt-2 text-sm text-muted-foreground">{import.meta.env.DEV ? detail : "应用路由配置无效，请联系管理员。"}</p></section></main>
}

export function View({ store, basename, components, layouts }: {
  readonly store: StoreBinding
  readonly basename: string
  readonly components: Readonly<Record<string, ComponentType>>
  readonly layouts: Readonly<Record<Layout, ComponentType>>
}) {
  const state = useStore(store.state)
  if (!state.ready) return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">正在准备应用…</main>
  if (state.error) return <Failure detail={state.error.message} />
  return (
    <Context value={store}>
      <BrowserRouter basename={basename}>
        <Routes>
          {(["normal", "empty"] as const).map((layout) => {
            const LayoutComponent = layouts[layout]
            return (
              <Route key={layout} element={<LayoutComponent />}>
                {state.routes.filter((route) => route.layout === layout).map((route) => {
                  let element: ReactNode
                  if (route.target.kind === "redirect") element = <Navigate replace to={route.target.redirect} />
                  else {
                    const Component = components[route.target.component]
                    element = Component ? <Component /> : <Failure detail={`未知页面组件：${route.target.component}`} />
                  }
                  return <Route key={route.id} path={route.path} element={element} />
                })}
              </Route>
            )
          })}
        </Routes>
      </BrowserRouter>
    </Context>
  )
}

export const Router = { View }
