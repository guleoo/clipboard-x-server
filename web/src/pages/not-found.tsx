import { Link } from "react-router"
import { Button } from "@/frame/components/ui/button"

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-raised max-w-md p-7 text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">这个地址不属于管理控制台。</p>
        <Button className="mt-5" render={<Link to="/" />}>返回概览</Button>
      </section>
    </main>
  )
}
