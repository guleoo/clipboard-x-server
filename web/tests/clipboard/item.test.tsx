import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { toast } from "sonner";
import "../support/dom"
import type { Client } from "../../src/api/client";
import type { ClipboardItem, Transfer } from "../../src/api/schemas";
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react");
const { ApiProvider } = await import("../../src/api");
await import("../../src/i18n")
const { i18n } = await import("../../src/frame/common/i18n");
const { usePreferences } = await import("../../src/stores/preferences");
const { ClipboardItemCard } = await import("../../src/components/domain/clipboard-item");

beforeEach(async () => {
  usePreferences.setState({ offsetMinutes: 0 })
  await i18n.changeLanguage("en")
})

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem")

afterEach(() => {
  cleanup()
  usePreferences.setState({ offsetMinutes: 0 })
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
  else Reflect.deleteProperty(navigator, "clipboard")
  if (clipboardItemDescriptor) Object.defineProperty(globalThis, "ClipboardItem", clipboardItemDescriptor)
  else Reflect.deleteProperty(globalThis, "ClipboardItem")
})

const item: ClipboardItem = {
  id: "item-1",
  channelId: "channel-1",
  channelName: "Pictures",
  createdAt: 1,
  updatedAt: 1,
  origin: {
    deviceId: "device-1",
    tag: "Laptop",
    iconKind: "laptop",
    iconColor: { light: "#ffffff" },
    kind: "client",
  },
  contents: [{
    id: "original",
    mimeType: "image/png",
    size: 128,
    sha256: "a".repeat(64),
    delivery: "on-demand",
    availability: "source-required",
  }],
  previews: [{
    id: "thumbnail",
    contentId: "original",
    mimeType: "image/webp",
    size: 32,
    sha256: "b".repeat(64),
    truncated: false,
  }],
}

function transfer(state: Transfer["state"]): Transfer {
  return {
    id: "transfer-1",
    itemId: item.id,
    deviceId: item.origin.deviceId,
    kind: "content",
    direction: "download",
    state,
    completedBytes: state === "completed" ? 128 : 0,
    totalBytes: 128,
    peerDeviceIds: [item.origin.deviceId],
    createdAt: 1,
    updatedAt: 1,
    error: { code: "", message: "" },
  }
}

const fullText = `${"x".repeat(9 * 1024 - 9)}FULL TEXT`
const textItem: ClipboardItem = {
  ...item,
  contents: [{ ...item.contents[0]!, mimeType: "text/plain;charset=utf-8", size: 9 * 1024, delivery: "eager", availability: "available" }],
  previews: [{ ...item.previews[0]!, mimeType: "text/plain;charset=utf-8", size: 4096, truncated: true }],
}

test("loads available full text only when opening details and keeps the list preview truncated", async () => {
  const preview = mock(async () => new Blob([fullText.slice(0, 4096)]))
  const content = mock(async () => new Blob([fullText]))
  const requestContent = mock(async () => ({ transfer: transfer("completed") }))
  const writeText = mock(async (_text: string) => undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={{ preview, content, requestContent } as unknown as Client}><QueryClientProvider client={query}>
    <ClipboardItemCard item={textItem} remove={() => undefined} />
  </QueryClientProvider></ApiProvider>)

  await screen.findByText("Preview truncated")
  expect(content).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
  const dialog = within(await screen.findByRole("dialog"))
  expect(await dialog.findByText(fullText)).toBeTruthy()
  expect(dialog.queryByText("Preview truncated")).toBeNull()
  expect(screen.getByText("Preview truncated")).toBeTruthy()
  expect(content).toHaveBeenCalledWith(item.id, "original")
  expect(requestContent).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole("button", { name: "Copy full content" }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(fullText))
})

test("materializes lazy text before displaying its full content", async () => {
  const preview = mock(async () => new Blob(["Short preview"]))
  const content = mock(async () => new Blob([fullText]))
  const requestContent = mock(async () => ({ transfer: transfer("waiting-for-peer") }))
  const readTransfer = mock(async () => transfer("waiting-for-peer"))
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const lazyText: ClipboardItem = {
    ...textItem,
    contents: textItem.contents.map((representation) => ({ ...representation, delivery: "on-demand", availability: "source-required" })),
  }
  render(<ApiProvider client={{ preview, content, requestContent, transfer: readTransfer } as unknown as Client}><QueryClientProvider client={query}>
    <ClipboardItemCard item={lazyText} remove={() => undefined} />
  </QueryClientProvider></ApiProvider>)

  await screen.findByText("Short preview")
  expect(requestContent).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
  await waitFor(() => expect(readTransfer).toHaveBeenCalled())
  const dialog = within(await screen.findByRole("dialog"))
  expect(requestContent).toHaveBeenCalledWith(item.id, "original")
  expect(content).not.toHaveBeenCalled()
  expect(dialog.getByText("Fetching full content")).toBeTruthy()
  await act(async () => { query.setQueryData(["transfer", "transfer-1"], transfer("completed")) })
  expect(await dialog.findByText(fullText)).toBeTruthy()
  expect(dialog.queryByText("Preview truncated")).toBeNull()
  expect(requestContent).toHaveBeenCalledTimes(1)
})

test("opens full text even when the item has no preview", async () => {
  const content = mock(async () => new Blob([fullText]))
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={{ content } as unknown as Client}><QueryClientProvider client={query}>
    <ClipboardItemCard item={{ ...textItem, previews: [] }} remove={() => undefined} />
  </QueryClientProvider></ApiProvider>)
  expect(content).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
  expect(await within(await screen.findByRole("dialog")).findByText(fullText)).toBeTruthy()
})

test("reports a full-text read failure instead of presenting a truncated preview as full content", async () => {
  const preview = mock(async () => new Blob(["Short preview"]))
  const content = mock(async () => { throw new Error("Content unavailable") })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={{ preview, content } as unknown as Client}><QueryClientProvider client={query}>
    <ClipboardItemCard item={textItem} remove={() => undefined} />
  </QueryClientProvider></ApiProvider>)
  await screen.findByText("Short preview")
  fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
  const dialog = within(await screen.findByRole("dialog"))
  expect(await dialog.findByText("Full content unavailable")).toBeTruthy()
  expect(dialog.queryByText("Short preview")).toBeNull()
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  expect(dialog.getByText("完整内容不可用")).toBeTruthy()
})

test("clicking a lazy image preview materializes and displays its full content", async () => {
  const requestContent = mock(async () => ({ transfer: transfer("waiting-for-peer") }))
  const readTransfer = mock(async () => transfer("completed"))
  const api = { requestContent, transfer: readTransfer }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <ClipboardItemCard item={item} remove={() => undefined} />
      </QueryClientProvider>
    </ApiProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
  await waitFor(() => expect(requestContent).toHaveBeenCalledWith(item.id, "original"))
  const fullImages = await screen.findAllByAltText("Full image from Laptop")
  expect(fullImages).toHaveLength(2)
  expect(fullImages.every((image) => image.getAttribute("src") === "/admin/api/v1/items/item-1/contents/original")).toBe(true)
})

test("copies the full content of an available image", async () => {
  class ClipboardItemMock {
    constructor(readonly data: Record<string, Blob | Promise<Blob>>) {}
  }
  const write = mock(async ([clipboardItem]: ClipboardItemMock[]) => {
    const image = await clipboardItem?.data["image/png"]
    expect(image).toBeInstanceOf(Blob)
    expect(image?.type).toBe("image/png")
  })
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: ClipboardItemMock })
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } })
  const content = mock(async () => new Blob(["image"], { type: "image/png" }))
  const api = { content }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const availableItem: ClipboardItem = {
    ...item,
    contents: item.contents.map((representation) => ({ ...representation, availability: "available" })),
  }

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <ClipboardItemCard item={availableItem} remove={() => undefined} />
      </QueryClientProvider>
    </ApiProvider>,
  )

  const copy = screen.getByRole("button", { name: "Copy image" })
  fireEvent.click(copy)
  await waitFor(() => expect(content).toHaveBeenCalledWith(item.id, "original"))
  expect(write).toHaveBeenCalledTimes(1)
})

test("updates image accessibility labels when the language changes", async () => {
  const availableItem: ClipboardItem = {
    ...item,
    contents: item.contents.map((representation) => ({ ...representation, availability: "available" })),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={{} as Client}>
      <QueryClientProvider client={query}>
        <ClipboardItemCard item={availableItem} remove={() => undefined} />
      </QueryClientProvider>
    </ApiProvider>,
  )

  expect(screen.getByAltText("Full image from Laptop")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Copy image" })).toBeTruthy()
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  expect(screen.getByAltText("来自 Laptop 的完整图片")).toBeTruthy()
  expect(screen.getByRole("button", { name: "复制图片" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "查看剪切板内容" })).toBeTruthy()
  expect(screen.getByText("Laptop")).toBeTruthy()
})

test("updates clipboard timestamps immediately when the UTC offset changes", () => {
  const availableItem: ClipboardItem = {
    ...item,
    contents: item.contents.map((representation) => ({ ...representation, availability: "available" })),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <ApiProvider client={{} as Client}>
      <QueryClientProvider client={query}>
        <ClipboardItemCard item={availableItem} remove={() => undefined} />
      </QueryClientProvider>
    </ApiProvider>,
  )

  expect(view.container.querySelector("time")?.textContent).toContain("12:00 AM")
  act(() => usePreferences.setState({ offsetMinutes: 480 }))
  expect(view.container.querySelector("time")?.textContent).toContain("8:00 AM")
  expect(screen.getByText("Laptop")).toBeTruthy()
})

test.each([
  ["completed", "success", "Content synced"],
  ["failed", "error", "Content sync failed. Please try again."],
  ["expired", "error", "This transfer has expired. Start a new transfer."],
  ["cancelled", "info", "Content sync cancelled"],
] as const)("reports a requested image transfer ending in %s only once", async (state, kind, message) => {
  const feedback = spyOn(toast, kind)
  const api = {
    requestContent: mock(async () => ({ transfer: transfer("waiting-for-peer") })),
    transfer: mock(async () => transfer(state)),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}>
      <ClipboardItemCard item={item} remove={() => undefined} />
    </QueryClientProvider></ApiProvider>)
    expect(feedback).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "View clipboard content" }))
    await waitFor(() => expect(feedback).toHaveBeenCalledWith(message, { id: "content-transfer-transfer-1" }))
    const reports = () => feedback.mock.calls.filter((call) => call[0] === message).length
    expect(reports()).toBe(1)
    await act(async () => { await query.invalidateQueries({ queryKey: ["transfer", "transfer-1"] }) })
    await act(async () => { await i18n.changeLanguage("zh-CN") })
    expect(reports()).toBe(1)
  } finally {
    cleanup()
    feedback.mockRestore()
  }
})

test("reports a content request's polling failure without repeating it on each retry", async () => {
  const feedback = spyOn(toast, "error")
  const api = {
    requestContent: mock(async () => ({ transfer: transfer("waiting-for-peer") })),
    transfer: mock(async () => { throw new Error("Read failed") }),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const fileItem: ClipboardItem = { ...item, contents: [{ ...item.contents[0]!, mimeType: "application/octet-stream" }], previews: [] }
  try {
    render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}>
      <ClipboardItemCard item={fileItem} remove={() => undefined} />
    </QueryClientProvider></ApiProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Get content" }))
    await waitFor(() => expect(feedback).toHaveBeenCalledWith("Something went wrong. Please try again.", { id: "content-transfer-transfer-1" }))
    await act(async () => { await query.invalidateQueries({ queryKey: ["transfer", "transfer-1"] }) })
    expect(feedback).toHaveBeenCalledTimes(1)
  } finally {
    cleanup()
    feedback.mockRestore()
  }
})

test("reports download initiation only after receiving content and starting the browser download", async () => {
  const feedback = spyOn(toast, "success")
  const createUrl = spyOn(URL, "createObjectURL").mockReturnValue("blob:test-download")
  const revokeUrl = spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
  const content = mock(async () => new Blob(["image"], { type: "image/png" }))
  const availableItem: ClipboardItem = { ...item, contents: item.contents.map((representation) => ({ ...representation, availability: "available" })) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    render(<ApiProvider client={{ content } as unknown as Client}><QueryClientProvider client={query}>
      <ClipboardItemCard item={availableItem} remove={() => undefined} />
    </QueryClientProvider></ApiProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Download full content" }))
    await waitFor(() => expect(feedback).toHaveBeenCalledWith("Download started"))
    expect(content).toHaveBeenCalledWith(item.id, "original")
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-download")
  } finally {
    cleanup()
    feedback.mockRestore()
    createUrl.mockRestore()
    revokeUrl.mockRestore()
    click.mockRestore()
  }
})
