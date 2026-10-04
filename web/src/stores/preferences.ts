import { create } from "zustand"
import { z } from "zod"
import { i18n } from "@/frame/common/i18n"
import { LocalStorage } from "@/frame/common/storage"

export type Language = "en" | "zh-CN"
const schema = z.object({
  language: z.enum(["en", "zh-CN"]),
  offsetMinutes: z.number().int().min(-720).max(840).multipleOf(15),
})
const item = LocalStorage.scope("clipboard-x").item({
  key: "display-preferences",
  version: 1,
  schema,
  fallback: () => ({ language: "en" as const, offsetMinutes: 0 }),
})

interface State {
  readonly language: Language
  readonly offsetMinutes: number
  setLanguage(language: Language): void
  setOffset(offsetMinutes: number): void
  initialize(): () => void
}

export const usePreferences = create<State>((set, get) => ({
  ...item.get(),
  setLanguage: (language) => {
    item.set({ language, offsetMinutes: get().offsetMinutes })
    set({ language })
    void i18n.changeLanguage(language)
  },
  setOffset: (offsetMinutes) => {
    const value = schema.parse({ language: get().language, offsetMinutes })
    item.set(value)
    set(value)
  },
  initialize: () => {
    const apply = (value: z.infer<typeof schema>) => {
      set(value)
      void i18n.changeLanguage(value.language)
    }
    apply(item.get())
    return item.subscribe(apply)
  },
}))
