import { Button } from "@/frame/components/ui/button"

export function ErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-raised max-w-md p-7 text-center">
        <h1 className="text-xl font-semibold">应用无法继续</h1>
        <p className="mt-2 text-sm text-muted-foreground">请刷新页面；如果问题持续存在，请检查服务日志。</p>
        <Button className="mt-5" onClick={() => location.reload()}>刷新页面</Button>
      </section>
    </main>
  )
}
