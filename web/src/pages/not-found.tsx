import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/frame/components/ui/button"

export function NotFoundPage() {
  const { t } = useTranslation("common")
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-raised max-w-md p-7 text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-xl font-semibold">{t("notFound")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFoundDescription")}</p>
        <Button className="mt-5" render={<Link to="/" />}>{t("home")}</Button>
      </section>
    </main>
  )
}
