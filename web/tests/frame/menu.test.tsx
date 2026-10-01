import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../support/dom"
const { i18n } = await import("../../src/i18n");
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { Button } = await import("../../src/frame/components/ui/button");
const { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } = await import("../../src/frame/components/ui/dropdown-menu");
afterEach(cleanup)
beforeEach(async () => { await i18n.changeLanguage("en") })

describe("Base UI menu", () => {
  test("opens a labelled Base UI menu within the required group context", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button>设置</Button>} />
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>administrator</DropdownMenuLabel>
            <DropdownMenuItem>设备</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    fireEvent.click(screen.getByRole("button", { name: "设置" }))
    expect(await screen.findByText("administrator")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "设备" })).toBeTruthy()
  })
});
