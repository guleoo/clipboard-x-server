import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import "../support/dom"
const { i18n } = await import("../../src/i18n");
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { EmptyState, ErrorState, LoadingState } = await import("../../src/components/domain/states");
afterEach(cleanup)
beforeEach(async () => { await i18n.changeLanguage("en") })

describe("domain states", () => {
  test("exposes loading, empty and retry states to assistive technology", () => {
    const loading = render(<LoadingState label="正在同步" />)
    expect(screen.getByText("正在同步")).toBeTruthy()
    loading.unmount()
    const empty = render(<EmptyState title="没有条目" description="等待设备发布" />)
    expect(screen.getByRole("heading", { name: "没有条目" })).toBeTruthy()
    empty.unmount()
    const retry = mock(() => undefined)
    render(<ErrorState error={new Error("连接失败")} retry={retry} />)
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
});
