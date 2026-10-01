import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost/login" })
history.replaceState(null, "", "/login")

const { cleanup, render, screen } = await import("@testing-library/react")
const { default: App } = await import("../src/App")
const { usePreferences } = await import("../src/stores/preferences")

afterEach(cleanup)
beforeEach(() => { usePreferences.getState().setLanguage("en") })

test("renders the governed login route through the application composition root", async () => {
  render(<App />)
  expect(await screen.findByRole("heading", { name: "Sign in to Clipboard X" })).toBeTruthy()
  expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy()
})
