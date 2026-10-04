import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
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
    return <Failure error={this.state.error} />
  }
}

function Failure({ error }: { readonly error: Error }) {
  const { t } = useTranslation("common")
  return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section className="surface-raised max-w-md p-6 text-center" role="alert">
          <h1 className="text-lg font-semibold">{t("renderError")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("renderErrorDescription")}</p>
          {import.meta.env.DEV ? <p className="mt-2 text-xs text-muted-foreground">{error.message}</p> : null}
          <Button className="mt-5" onClick={() => window.location.reload()}>{t("reload")}</Button>
        </section>
      </main>
    )
}
