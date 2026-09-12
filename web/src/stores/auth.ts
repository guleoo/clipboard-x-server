import { create } from "zustand"
import type { Administrator } from "@/api"

interface State {
  readonly administrator: Administrator | undefined
  readonly revision: number
  readonly authenticated: boolean
  establish(administrator: Administrator): void
  clear(): void
}

export const useAuth = create<State>((set) => ({
  revision: 0,
  authenticated: false,
  administrator: undefined,
  establish: (administrator) => set((state) => ({ administrator, authenticated: true, revision: state.revision + 1 })),
  clear: () => set((state) => ({ administrator: undefined, authenticated: false, revision: state.revision + 1 })),
}))
