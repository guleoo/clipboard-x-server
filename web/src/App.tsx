import { lazy, Suspense, useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Api, ApiProvider } from "@/api"
import { ErrorBoundary } from "@/frame/components/error-boundary"
import { Toaster } from "@/frame/components/ui/sonner"
import { TooltipProvider } from "@/frame/components/ui/tooltip"
import { EmptyLayout } from "@/frame/layout"
import { Request } from "@/frame/request"
import { Router } from "@/frame/router"
import { NormalLayout } from "@/layout/normal"
import { parseUserRoutes } from "@/routes"
import { RouterStore, useTheme } from "@/stores"

function createRuntime() {
  const request = Request.Client.create()
  const api = Api.Client.create(request)
  const router = RouterStore.create()
  router.publishUser(parseUserRoutes([]))
  const query = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  })
  return { api, router, query }
}

const components = {
  login: lazy(() => import("@/pages/login").then(({ LoginPage }) => ({ default: LoginPage }))),
  error: lazy(() => import("@/pages/error").then(({ ErrorPage }) => ({ default: ErrorPage }))),
  "not-found": lazy(() => import("@/pages/not-found").then(({ NotFoundPage }) => ({ default: NotFoundPage }))),
  devices: lazy(() => import("@/pages/devices").then(({ DevicesPage }) => ({ default: DevicesPage }))),
  transfers: lazy(() => import("@/pages/transfers").then(({ TransfersPage }) => ({ default: TransfersPage }))),
  clipboard: lazy(() => import("@/pages/clipboard").then(({ ClipboardPage }) => ({ default: ClipboardPage }))),
  account: lazy(() => import("@/pages/account").then(({ AccountPage }) => ({ default: AccountPage }))),
  retention: lazy(() => import("@/pages/retention").then(({ RetentionPage }) => ({ default: RetentionPage }))),
} as const
const layouts = { normal: NormalLayout, empty: EmptyLayout } as const

export default function App() {
  const [runtime] = useState(createRuntime)
  const initializeTheme = useTheme((state) => state.initialize)
  const theme = useTheme((state) => state.resolved)
  useEffect(() => initializeTheme(), [initializeTheme])
  return (
    <ErrorBoundary>
      <ApiProvider client={runtime.api}>
        <QueryClientProvider client={runtime.query}>
          <TooltipProvider>
            <Suspense fallback={
              <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
                正在加载页面…
              </main>
            }>
              <Router.View
                store={runtime.router}
                basename="/"
                components={components}
                layouts={layouts}
              />
            </Suspense>
            <Toaster theme={theme} position="top-right" richColors />
          </TooltipProvider>
        </QueryClientProvider>
      </ApiProvider>
    </ErrorBoundary>
  )
}
