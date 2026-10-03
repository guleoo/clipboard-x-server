import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
import type { CleanupConfiguration } from "../../src/api";
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { ApiProvider } = await import("../../src/api");
const { ConfigurationPage } = await import("../../src/pages/configuration");
const { usePreferences } = await import("../../src/stores/preferences");
await import("../../src/i18n")
const { i18n } = await import("../../src/frame/common/i18n");

afterEach(cleanup)
beforeEach(async () => { await i18n.changeLanguage("en") })

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

test("loads cleanup settings and keeps preference changes separate from saving the policy", async () => {
  const initial: CleanupConfiguration = {
    enabled: true,
    intervalMillis: 3_600_000,
    clipboard: { maxItemsPerDevicePerChannel: 1000, maxAgeMillis: 2_592_000_000 },
  }
  const { updateCleanup } = renderPage(initial)
  await waitFor(() => expect(input("cleanup-device-channel").value).toBe("1000"))
  expect(input("cleanup-age").value).toBe("30")
  expect(screen.getByRole("switch", { name: "Enable automatic cleanup" }).getAttribute("aria-checked")).toBe("true")
  expect(screen.getByRole("combobox", { name: "Language" })).toBeTruthy()
  const previousOffset = usePreferences.getState().offsetMinutes
  try {
    fireEvent.change(screen.getByLabelText("UTC offset"), { target: { value: "08:30" } })
    expect(usePreferences.getState().offsetMinutes).toBe(510)
    expect(updateCleanup).not.toHaveBeenCalled()
    expect(input("cleanup-device-channel").value).toBe("1000")
    expect(input("cleanup-age").value).toBe("30")
    fireEvent.click(screen.getByRole("button", { name: "Save cleanup policy" }))
    await waitFor(() => expect(updateCleanup).toHaveBeenCalledWith(initial))
  } finally {
    cleanup()
    usePreferences.getState().setOffset(previousOffset)
  }
})

test("enabling periodic cleanup confirms and submits the retention policy", async () => {
  const { updateCleanup } = renderPage(defaults)
  await screen.findByText("Cleanup policy")
  await waitFor(() => expect(input("cleanup-interval").value).toBe("60"))
  fireEvent.click(document.getElementById("cleanup-enabled")!)
  fireEvent.change(input("cleanup-total"), { target: { value: "500" } })
  fireEvent.change(input("cleanup-device-channel"), { target: { value: "25" } })
  fireEvent.change(input("cleanup-age"), { target: { value: "1.5" } })
  fireEvent.change(input("cleanup-interval"), { target: { value: "30" } })
  fireEvent.click(screen.getByRole("button", { name: "Save cleanup policy" }))
  const dialogTitle = await screen.findByText("Apply a stricter cleanup policy?")
  const confirmation = dialogTitle.closest<HTMLElement>("[data-slot=cleanup-confirmation]")
  if (!confirmation) throw new Error("Cleanup confirmation did not open")
  expect(updateCleanup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText("Confirm and save"))
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
  await waitFor(() => expect(screen.queryByText("Apply a stricter cleanup policy?")).toBeNull())
  fireEvent.change(input("cleanup-total"), { target: { value: "600" } })
  fireEvent.click(screen.getByRole("button", { name: "Save cleanup policy" }))
  await waitFor(() => expect(updateCleanup).toHaveBeenCalledTimes(2))
  expect(screen.queryByText("Apply a stricter cleanup policy?")).toBeNull()
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
  fireEvent.click(screen.getByRole("button", { name: "Save cleanup policy" }))
  await waitFor(() => expect(updateCleanup).toHaveBeenCalledWith({ ...initial, clipboard: {} }))
  expect(screen.queryByText("Apply a stricter cleanup policy?")).toBeNull()
})

test("retranslates an existing validation error and preserves the form when switching languages", async () => {
  const { updateCleanup } = renderPage(defaults)
  await waitFor(() => expect(input("cleanup-interval").value).toBe("60"))
  fireEvent.change(input("cleanup-interval"), { target: { value: "0.5" } })
  fireEvent.submit(screen.getByRole("button", { name: "Save cleanup policy" }).closest("form")!)
  expect(screen.getByRole("alert").textContent).toContain("Cleanup interval (minutes) is outside the allowed range")
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("周期清理间隔（分钟）超出允许范围"))
  expect(screen.getByRole("button", { name: "保存清理策略" })).toBeTruthy()
  expect(input("cleanup-interval").value).toBe("0.5")
  expect(updateCleanup).not.toHaveBeenCalled()
})
