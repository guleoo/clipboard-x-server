import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { Channel, ClipboardItem } from "../src/api/schemas"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, fireEvent, render, screen, within } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router")
const { ApiProvider } = await import("../src/api")
const { ClipboardPage } = await import("../src/pages/clipboard")

const originalWidth = window.innerWidth
afterEach(() => {
  cleanup()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth })
})

const channel: Channel = {
  id: "channel-1",
  name: "Pictures",
  createdAt: 1,
  updatedAt: 1,
  members: [],
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

  const cardRegion = await screen.findByLabelText("剪切板内容")
  expect(cardRegion.classList.contains("overflow-y-auto")).toBe(true)
  expect(screen.queryByText("活动")).toBeNull()
})

test("places the newest cards across the top before filling each masonry column", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 })
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
