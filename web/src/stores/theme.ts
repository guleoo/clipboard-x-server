import { create } from "zustand"
import { z } from "zod"
import { LocalStorage } from "@/frame/common/storage"

export type Preference = "system" | "light" | "dark"
const item = LocalStorage.scope("clipboard-x").item({
  key: "theme",
  version: 1,
  schema: z.enum(["system", "light", "dark"]),
  fallback: () => "system" as const,
})

interface State {
  readonly preference: Preference
  readonly resolved: "light" | "dark"
  set(preference: Preference): void
  initialize(): () => void
}

function system(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function apply(preference: Preference): "light" | "dark" {
  const resolved = preference === "system" ? system() : preference
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.style.colorScheme = resolved
  return resolved
}

export const useTheme = create<State>((set, get) => ({
  preference: item.get(),
  resolved: "light",
  set: (preference) => {
    item.set(preference)
    set({ preference, resolved: apply(preference) })
  },
  initialize: () => {
    set({ resolved: apply(get().preference) })
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const change = () => {
      if (get().preference === "system") set({ resolved: apply("system") })
    }
    media.addEventListener("change", change)
    const unsubscribe = item.subscribe((preference) => set({ preference, resolved: apply(preference) }))
    return () => { media.removeEventListener("change", change); unsubscribe() }
  },
}))
