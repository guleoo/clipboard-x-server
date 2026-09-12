import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "./ui/button"

export class ErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly error?: Error }> {
  public state: { readonly error?: Error } = {}

  public static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Clipboard X Web render failed", { message: error.message, componentStack: info.componentStack })
  }

  public render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section className="surface-raised max-w-md p-6 text-center" role="alert">
          <h1 className="text-lg font-semibold">管理控制台无法继续运行</h1>
          <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>重新加载</Button>
        </section>
      </main>
    )
  }
}
