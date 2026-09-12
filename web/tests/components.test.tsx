import { afterEach, describe, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react")
const { ConfirmAction } = await import("../src/components/domain/confirm-action")
const { EmptyState, ErrorState, LoadingState } = await import("../src/components/domain/states")
const { Button } = await import("../src/frame/components/ui/button")

afterEach(cleanup)

describe("domain components", () => {
  test("exposes loading, empty and retry states to assistive technology", () => {
    const loading = render(<LoadingState label="正在同步" />)
    expect(screen.getByText("正在同步")).toBeTruthy()
    loading.unmount()
    const empty = render(<EmptyState title="没有条目" description="等待设备发布" />)
    expect(screen.getByRole("heading", { name: "没有条目" })).toBeTruthy()
    empty.unmount()
    const retry = mock(() => undefined)
    render(<ErrorState error={new Error("连接失败")} retry={retry} />)
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  test("requires an explicit destructive confirmation", async () => {
    const confirm = mock(() => undefined)
    render(
      <ConfirmAction
        trigger={<Button>删除条目</Button>}
        title="删除此条目？"
        description="此操作会通知所有设备。"
        confirmLabel="确认删除"
        onConfirm={confirm}
      />,
    )
    const trigger = screen.getByRole("button", { name: "删除条目" })
    fireEvent.click(trigger)
    expect(await screen.findByRole("alertdialog")).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})
