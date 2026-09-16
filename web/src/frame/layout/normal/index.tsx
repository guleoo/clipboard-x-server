import type { ReactNode } from "react"
import { Outlet } from "react-router"

export function Layout({ brand, navigation, actions }: {
  readonly brand: ReactNode
  readonly navigation: ReactNode
  readonly actions: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 h-14 border-b bg-background/95">
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          {brand}
          <div className="min-w-0 flex-1">{navigation}</div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
      </header>
      <main className="min-h-[calc(100vh-3.5rem)]"><Outlet /></main>
    </div>
  )
}

export function Page({ title, description, action, children }: {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>
        {action}
      </header>
      {children}
    </div>
  )
}
