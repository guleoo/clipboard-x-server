import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost/login" })
history.replaceState(null, "", "/login")

const { cleanup, render, screen } = await import("@testing-library/react")
const { default: App } = await import("../src/App")

afterEach(cleanup)

test("renders the governed login route through the application composition root", async () => {
  render(<App />)
  expect(await screen.findByRole("heading", { name: "登录 Clipboard X" })).toBeTruthy()
  expect(screen.getByRole("textbox", { name: "用户名" })).toBeTruthy()
})
