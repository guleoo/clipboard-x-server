import { createContext, useContext, type ReactNode } from "react"
import type { Client } from "./client"

const Context = createContext<Client | undefined>(undefined)

export function Provider({ client, children }: { readonly client: Client; readonly children: ReactNode }) {
  return <Context value={client}>{children}</Context>
}

export function useApi(): Client {
  const client = useContext(Context)
  if (!client) throw new Error("API client is not available")
  return client
}
