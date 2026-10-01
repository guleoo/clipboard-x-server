import { Button } from "@/frame/components/ui/button"
import { useTranslation } from "react-i18next"

export function ErrorPage() {
  const { t } = useTranslation("common")
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-raised max-w-md p-7 text-center">
        <h1 className="text-xl font-semibold">{t("renderError")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("renderErrorDescription")}</p>
        <Button className="mt-5" onClick={() => location.reload()}>{t("reload")}</Button>
      </section>
    </main>
  )
}
