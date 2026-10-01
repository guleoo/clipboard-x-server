import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { Channel, ClipboardItem } from "../src/api/schemas"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { act, cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router")
const { ApiProvider } = await import("../src/api")
await import("../src/i18n")
const { i18n } = await import("../src/frame/common/i18n")
const { ClipboardPage } = await import("../src/pages/clipboard")

beforeEach(async () => { await i18n.changeLanguage("en") })

const originalWidth = window.innerWidth
const originalObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver")
afterEach(() => {
  cleanup()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth })
  if (originalObserver) Object.defineProperty(window, "IntersectionObserver", originalObserver)
  else Reflect.deleteProperty(window, "IntersectionObserver")
})

const channel: Channel = {
  id: "channel-1",
  name: "Pictures",
  createdAt: 1,
  updatedAt: 1,
  members: [],
}

const item = (number: number): ClipboardItem => ({
  id: `item-${number}`,
  channelId: channel.id,
  channelName: channel.name,
  createdAt: number,
  updatedAt: number,
  origin: {
    deviceId: `device-${number}`,
    tag: `Device ${number}`,
    iconKind: "laptop",
    iconColor: { light: "#ffffff" },
    kind: "client",
  },
  contents: [],
  previews: [],
})

function stubIntersectionObserver() {
  let callback: IntersectionObserverCallback | undefined
  let root: Element | Document | null | undefined
  let registrations = 0
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: class {
      constructor(onIntersection: IntersectionObserverCallback, options: IntersectionObserverInit) {
        callback = onIntersection
        root = options.root
        registrations += 1
      }
      observe() {}
      disconnect() {}
    },
  })
  return {
    get root() { return root },
    get registrations() { return registrations },
    intersect() {
      if (!callback) throw new Error("Scroll observer has not been registered")
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    },
  }
}

test("keeps clipboard cards in an independently scrollable main region", async () => {
  const api = {
    channels: mock(async () => [channel]),
    devices: mock(async () => []),
    items: mock(async () => ({ items: [], cursor: "", hasMore: false })),
    transfers: mock(async () => []),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <MemoryRouter initialEntries={["/?channelId=channel-1"]}>
          <ClipboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>,
  )

  const cardRegion = await screen.findByLabelText("Clipboard content")
  expect(cardRegion.classList.contains("overflow-y-auto")).toBe(true)
  expect(screen.queryByText("Activity")).toBeNull()
})

test("places the newest cards across the top before filling each masonry column", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 })
  const api = {
    channels: mock(async () => [channel]),
    devices: mock(async () => []),
    items: mock(async () => ({ items: [item(3), item(5), item(1), item(4), item(2)], cursor: "", hasMore: false })),
    transfers: mock(async () => []),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <MemoryRouter initialEntries={["/?channelId=channel-1"]}>
          <ClipboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>,
  )

  await screen.findByText("Device 5")
  const layout = () => screen.getAllByTestId("clipboard-column")
    .map((column) => within(column).queryAllByText(/^Device \d+$/u).map((tag) => tag.textContent))

  expect(layout()).toEqual([["Device 5", "Device 2"], ["Device 4", "Device 1"], ["Device 3"]])

  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 })
  fireEvent(window, new Event("resize"))
  expect(layout()).toEqual([["Device 5", "Device 3", "Device 1"], ["Device 4", "Device 2"]])

  Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 })
  fireEvent(window, new Event("resize"))
  expect(layout()).toEqual([["Device 5", "Device 4", "Device 3", "Device 2", "Device 1"]])
})

test("loads the next page near the scroll bottom and resets pagination when searching", async () => {
  const observer = stubIntersectionObserver()
  const api = {
    channels: mock(async () => [channel]),
    devices: mock(async () => []),
    items: mock(async (filters: { readonly cursor?: string; readonly query?: string; readonly limit: number }) => {
      if (filters.query) return { items: [item(9)], cursor: "", hasMore: false }
      if (filters.cursor === "last") return { items: [item(1)], cursor: "", hasMore: false }
      return filters.cursor === "next"
        ? { items: [item(2)], cursor: "last", hasMore: true }
        : { items: [item(3)], cursor: "next", hasMore: true }
    }),
    transfers: mock(async () => []),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <MemoryRouter initialEntries={["/?channelId=channel-1"]}>
          <ClipboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>,
  )

  await screen.findByText("Device 3")
  await waitFor(() => expect(observer.root).toBe(screen.getByLabelText("Clipboard content")))
  expect(api.items).toHaveBeenNthCalledWith(1, { channelId: channel.id, limit: 100 })

  act(() => observer.intersect())
  await screen.findByText("Device 2")
  expect(screen.getByText("Device 3")).toBeTruthy()
  expect(api.items).toHaveBeenNthCalledWith(2, { channelId: channel.id, limit: 100, cursor: "next" })
  await waitFor(() => expect(observer.registrations).toBeGreaterThan(1))
  act(() => observer.intersect())
  await screen.findByText("Device 1")
  expect(api.items).toHaveBeenNthCalledWith(3, { channelId: channel.id, limit: 100, cursor: "last" })
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull()

  const scrollRegion = screen.getByLabelText("Clipboard content")
  scrollRegion.scrollTop = 500
  fireEvent.change(screen.getByPlaceholderText("Search this channel"), { target: { value: "later" } })
  await screen.findByText("Device 9")
  expect(scrollRegion.scrollTop).toBe(0)
  expect(screen.queryByText("Device 3")).toBeNull()
  expect(api.items).toHaveBeenNthCalledWith(4, { channelId: channel.id, query: "later", limit: 100 })
})

test("keeps existing cards and allows retry when a later page fails", async () => {
  stubIntersectionObserver()
  let attempts = 0
  const api = {
    channels: mock(async () => [channel]),
    devices: mock(async () => []),
    items: mock(async (filters: { readonly cursor?: string }) => {
      if (!filters.cursor) return { items: [item(3)], cursor: "next", hasMore: true }
      attempts += 1
      if (attempts === 1) throw new Error("Next page unavailable")
      return { items: [item(2)], cursor: "", hasMore: false }
    }),
    transfers: mock(async () => []),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <MemoryRouter initialEntries={["/?channelId=channel-1"]}>
          <ClipboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>,
  )

  await screen.findByText("Device 3")
  fireEvent.click(screen.getByRole("button", { name: "Load more" }))
  await screen.findByRole("button", { name: "Loading failed, retry" })
  expect(screen.getByText("Device 3")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Loading failed, retry" }))
  await screen.findByText("Device 2")
  expect(api.items).toHaveBeenCalledTimes(3)
})

test("switches clipboard labels immediately without replacing channel or item data", async () => {
  const api = {
    channels: mock(async () => [channel]),
    devices: mock(async () => []),
    items: mock(async () => ({ items: [item(3)], cursor: "", hasMore: false })),
    transfers: mock(async () => []),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <MemoryRouter initialEntries={["/?channelId=channel-1"]}>
          <ClipboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>,
  )

  await screen.findByText("Device 3")
  expect(screen.getByPlaceholderText("Search this channel")).toBeTruthy()
  expect(screen.getByText("0 members")).toBeTruthy()
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  expect(screen.getByPlaceholderText("搜索当前频道")).toBeTruthy()
  expect(screen.getByLabelText("剪切板内容")).toBeTruthy()
  expect(screen.getByText("0 个成员")).toBeTruthy()
  expect(screen.getByText("Device 3")).toBeTruthy()
  expect(screen.getAllByText("Pictures").length).toBeGreaterThan(0)
  expect(api.items).toHaveBeenCalledTimes(1)
})
