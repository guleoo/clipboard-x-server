import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { CleanupConfiguration } from "../src/api"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react")
const { ApiProvider } = await import("../src/api")
const { ConfigurationPage } = await import("../src/pages/configuration")

afterEach(cleanup)

const defaults: CleanupConfiguration = {
  enabled: false,
  intervalMillis: 3_600_000,
  clipboard: {},
}

function renderPage(initial: CleanupConfiguration) {
  const updateCleanup = mock(async (input: CleanupConfiguration) => input)
  const api = {
    configuration: {
      getCleanup: async () => initial,
      updateCleanup,
    },
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <ConfigurationPage />
      </QueryClientProvider>
    </ApiProvider>,
  )
  return { updateCleanup }
}

function input(id: string): HTMLInputElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input #${id}`)
  return element
}

test("enabling periodic cleanup confirms and submits the retention policy", async () => {
  const { updateCleanup } = renderPage(defaults)
  await screen.findByText("清理策略")
  await waitFor(() => expect(input("cleanup-interval").value).toBe("60"))
  fireEvent.click(document.getElementById("cleanup-enabled")!)
  fireEvent.change(input("cleanup-total"), { target: { value: "500" } })
  fireEvent.change(input("cleanup-device-channel"), { target: { value: "25" } })
  fireEvent.change(input("cleanup-age"), { target: { value: "1.5" } })
  fireEvent.change(input("cleanup-interval"), { target: { value: "30" } })
  fireEvent.click(screen.getByRole("button", { name: "保存清理策略" }))
  const dialogTitle = await screen.findByText("确认应用更严格的清理策略？")
  const confirmation = dialogTitle.closest<HTMLElement>("[data-slot=cleanup-confirmation]")
  if (!confirmation) throw new Error("Cleanup confirmation did not open")
  expect(updateCleanup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText("确认保存"))
  await waitFor(() => expect(updateCleanup).toHaveBeenCalledWith({
    ...defaults,
    enabled: true,
    intervalMillis: 1_800_000,
    clipboard: {
      maxItems: 500,
      maxItemsPerDevicePerChannel: 25,
      maxAgeMillis: 129_600_000,
    },
  }))
  await waitFor(() => expect(screen.queryByText("确认应用更严格的清理策略？")).toBeNull())
  fireEvent.change(input("cleanup-total"), { target: { value: "600" } })
  fireEvent.click(screen.getByRole("button", { name: "保存清理策略" }))
  await waitFor(() => expect(updateCleanup).toHaveBeenCalledTimes(2))
  expect(screen.queryByText("确认应用更严格的清理策略？")).toBeNull()
})

test("loosening one limit saves without a destructive confirmation", async () => {
  const initial: CleanupConfiguration = {
    ...defaults,
    enabled: true,
    clipboard: { maxItemsPerChannel: 10 },
  }
  const { updateCleanup } = renderPage(initial)
  await waitFor(() => expect(input("cleanup-channel").value).toBe("10"))
  fireEvent.change(input("cleanup-channel"), { target: { value: "" } })
  fireEvent.click(screen.getByRole("button", { name: "保存清理策略" }))
  await waitFor(() => expect(updateCleanup).toHaveBeenCalledWith({ ...initial, clipboard: {} }))
  expect(screen.queryByText("确认应用更严格的清理策略？")).toBeNull()
})

test("exposes only periodic retention controls", async () => {
  renderPage(defaults)
  await screen.findByText("清理周期")
  expect(screen.queryByText("启动时")).toBeNull()
  expect(screen.queryByText("发布后")).toBeNull()
  expect(screen.queryByText("二进制对象")).toBeNull()
  expect(screen.queryByText("单轮执行预算")).toBeNull()
})

test("timing fields enforce the same minimum as the server schema", async () => {
  const { updateCleanup } = renderPage(defaults)
  await waitFor(() => expect(input("cleanup-interval").value).toBe("60"))
  fireEvent.change(input("cleanup-interval"), { target: { value: "0.5" } })
  fireEvent.submit(screen.getByRole("button", { name: "保存清理策略" }).closest("form")!)
  expect(screen.getByRole("alert").textContent).toContain("周期清理间隔超出允许范围")
  expect(updateCleanup).not.toHaveBeenCalled()
})
