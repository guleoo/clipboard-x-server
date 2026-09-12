import { create } from "zustand"
import { z } from "zod"
import { LocalStorage } from "@/frame/common/storage"

const TabSchema = z.object({ path: z.string().startsWith("/"), title: z.string().min(1) })
type Tab = z.infer<typeof TabSchema>
const item = LocalStorage.scope("clipboard-x").item({
  key: "recent-tabs",
  version: 1,
  schema: z.array(TabSchema).max(12),
  fallback: () => [],
})

interface State {
  readonly recent: readonly Tab[]
  visit(tab: Tab): void
  remove(path: string): void
}

export const useTabs = create<State>((set) => ({
  recent: item.get(),
  visit: (tab) => set((state) => {
    const recent = [tab, ...state.recent.filter((value) => value.path !== tab.path)].slice(0, 12)
    item.set(recent)
    return { recent }
  }),
  remove: (path) => set((state) => {
    const recent = state.recent.filter((value) => value.path !== path)
    item.set(recent)
    return { recent }
  }),
}))
