import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { ClipboardItem, Transfer } from "../src/api/schemas"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react")
const { ApiProvider } = await import("../src/api")
const { ClipboardItemCard } = await import("../src/components/domain/clipboard-item")

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem")

afterEach(() => {
  cleanup()
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

  fireEvent.click(screen.getByRole("button", { name: "查看剪切板内容" }))
  await waitFor(() => expect(requestContent).toHaveBeenCalledWith(item.id, "original"))
  const fullImages = await screen.findAllByAltText("来自 Laptop 的完整图片")
  expect(fullImages).toHaveLength(2)
  expect(fullImages.every((image) => image.getAttribute("src") === "/admin/api/v1/items/item-1/contents/original")).toBe(true)
})

test("copies an available image with the conventional copy icon", async () => {
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

  const copy = screen.getByRole("button", { name: "复制图片" })
  expect(copy.querySelector(".lucide-copy")).toBeTruthy()
  fireEvent.click(copy)
  await waitFor(() => expect(content).toHaveBeenCalledWith(item.id, "original"))
  expect(write).toHaveBeenCalledTimes(1)
})
