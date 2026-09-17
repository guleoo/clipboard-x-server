import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { Retention } from "../src/api"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react")
const { ApiProvider } = await import("../src/api")
const { RetentionPage } = await import("../src/pages/retention")

afterEach(cleanup)

function renderPage(initial: Retention) {
  const updateRetention = mock(async (input: Retention) => input)
  const api = { retention: mock(async () => initial), updateRetention }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <RetentionPage />
      </QueryClientProvider>
    </ApiProvider>,
  )
  return { updateRetention }
}

test("enabling limits requires confirmation and persists day/minute values as milliseconds", async () => {
  const { updateRetention } = renderPage({ sweepIntervalMillis: 3_600_000 })
  await screen.findByRole("heading", { name: "保留策略" })
  await waitFor(() => expect((screen.getByLabelText("清理间隔（分钟）") as HTMLInputElement).value).toBe("60"))
  fireEvent.change(screen.getByLabelText("每设备保留条数"), { target: { value: "50" } })
  fireEvent.change(screen.getByLabelText("最长保留时间（天）"), { target: { value: "1.5" } })
  fireEvent.change(screen.getByLabelText("清理间隔（分钟）"), { target: { value: "30" } })
  fireEvent.click(screen.getByRole("button", { name: "保存保留策略" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(updateRetention).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" }))
  await waitFor(() => expect(updateRetention).toHaveBeenCalledWith({
    maxItemsPerDevice: 50, maxAgeMillis: 129_600_000, sweepIntervalMillis: 1_800_000,
  }))
})

test("removing limits saves an unlimited policy without confirmation", async () => {
  const { updateRetention } = renderPage({ maxItemsPerChannel: 10, sweepIntervalMillis: 60_000 })
  await waitFor(() => expect((screen.getByLabelText("每 Channel 保留条数") as HTMLInputElement).value).toBe("10"))
  fireEvent.change(screen.getByLabelText("每 Channel 保留条数"), { target: { value: "" } })
  fireEvent.click(screen.getByRole("button", { name: "保存保留策略" }))
  await waitFor(() => expect(updateRetention).toHaveBeenCalledWith({ sweepIntervalMillis: 60_000 }))
  expect(screen.queryByRole("alertdialog")).toBeNull()
})

test("invalid numbers do not submit a retention policy", async () => {
  const { updateRetention } = renderPage({ sweepIntervalMillis: 3_600_000 })
  await waitFor(() => expect((screen.getByLabelText("清理间隔（分钟）") as HTMLInputElement).value).toBe("60"))
  fireEvent.change(screen.getByLabelText("每设备保留条数"), { target: { value: "1.5" } })
  fireEvent.submit(screen.getByRole("button", { name: "保存保留策略" }).closest("form")!)
  expect(screen.getByRole("alert").textContent).toContain("每设备保留条数必须是大于零的有效数字")
  expect(updateRetention).not.toHaveBeenCalled()
})
