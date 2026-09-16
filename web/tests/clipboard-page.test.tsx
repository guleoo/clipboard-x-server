import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Client } from "../src/api/client"
import type { Channel } from "../src/api/schemas"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, render, screen } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router")
const { ApiProvider } = await import("../src/api")
const { ClipboardPage } = await import("../src/pages/clipboard")

afterEach(cleanup)

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
