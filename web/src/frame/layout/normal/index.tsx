import { useState, type ReactNode } from "react"
import { MenuIcon } from "lucide-react"
import { Outlet } from "react-router"
import { Button } from "@/frame/components/ui/button"

export function Layout({ navigation, actions }: { readonly navigation: ReactNode; readonly actions: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/95 px-4 md:hidden">
        <Button variant="ghost" size="icon" aria-label="切换导航" onClick={() => setMobileOpen((value) => !value)}>
          <MenuIcon className="size-5" />
        </Button>
        <span className="ml-3 text-sm font-semibold">Clipboard X Server</span>
      </header>
      {mobileOpen ? <div className="fixed inset-x-0 top-14 z-20 border-b bg-sidebar p-4 md:hidden" onClick={() => setMobileOpen(false)}>{navigation}</div> : null}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r bg-sidebar p-4 text-sidebar-foreground md:flex md:flex-col">
        <div className="mb-7 flex items-center gap-3 px-2 py-1">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">CX</div>
          <div><p className="text-sm font-semibold leading-tight">Clipboard X</p><p className="text-xs text-muted-foreground">Server Console</p></div>
        </div>
        {navigation}
        <div className="mt-auto flex items-center gap-2 border-t pt-4">{actions}</div>
      </aside>
      <main className="min-h-screen md:pl-60"><Outlet /></main>
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
    <div className="mx-auto w-full max-w-7xl p-5 sm:p-8">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>
        {action}
      </header>
      {children}
    </div>
  )
}
