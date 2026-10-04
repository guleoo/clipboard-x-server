import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import "../support/dom"
const { i18n } = await import("../../src/i18n");
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { ConfirmAction } = await import("../../src/components/domain/confirm-action");
const { Button } = await import("../../src/frame/components/ui/button");
afterEach(cleanup)
beforeEach(async () => { await i18n.changeLanguage("en") })

describe("destructive confirmation", () => {
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
});
