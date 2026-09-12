import type { z } from "zod"

export interface Inspection<Value> {
  readonly value: Value
  readonly source: "storage" | "fallback"
  readonly reason?: "missing" | "expired" | "invalid" | "unavailable" | "future-version"
}

export interface WriteResult {
  readonly ok: boolean
  readonly error?: Error
}

export interface Item<Value> {
  get(): Value
  inspect(): Inspection<Value>
  set(value: Value): WriteResult
  update(change: (current: Value) => Value): WriteResult
  subscribe(listener: (value: Value) => void): () => void
}

interface Definition<Value> {
  readonly key: string
  readonly version: number
  readonly schema: z.ZodType<Value>
  readonly fallback: () => Value
  readonly ttl?: number
  readonly migrate?: (data: unknown, version: number) => unknown
}

interface Envelope {
  readonly version: number
  readonly writtenAt: number
  readonly expiresAt?: number
  readonly data: unknown
}

export function scope(prefix: string) {
  return {
    item<Value>(definition: Definition<Value>): Item<Value> {
      if (!Number.isInteger(definition.version) || definition.version < 1) {
        throw new Error("Storage item version must be a positive integer")
      }
      const key = `${prefix}:${definition.key}`
      const fallback = () => definition.schema.parse(definition.fallback())
      const listeners = new Set<(value: Value) => void>()

      function inspect(): Inspection<Value> {
        try {
          const raw = localStorage.getItem(key)
          if (raw === null) return { value: fallback(), source: "fallback", reason: "missing" }
          const envelope = JSON.parse(raw) as Envelope
          if (!envelope || typeof envelope !== "object" || !Number.isInteger(envelope.version)) throw new Error("Invalid envelope")
          if (envelope.version > definition.version) {
            return { value: fallback(), source: "fallback", reason: "future-version" }
          }
          if (envelope.expiresAt !== undefined && envelope.expiresAt <= Date.now()) {
            localStorage.removeItem(key)
            return { value: fallback(), source: "fallback", reason: "expired" }
          }
          const data = envelope.version === definition.version
            ? envelope.data
            : definition.migrate?.(envelope.data, envelope.version)
          const parsed = definition.schema.safeParse(data)
          if (!parsed.success) {
            localStorage.removeItem(key)
            return { value: fallback(), source: "fallback", reason: "invalid" }
          }
          return { value: parsed.data, source: "storage" }
        } catch {
          try {
            localStorage.removeItem(key)
          } catch {
            return { value: fallback(), source: "fallback", reason: "unavailable" }
          }
          return { value: fallback(), source: "fallback", reason: "invalid" }
        }
      }

      function set(value: Value): WriteResult {
        const parsed = definition.schema.safeParse(value)
        if (!parsed.success) return { ok: false, error: new Error("Storage value is invalid", { cause: parsed.error }) }
        const writtenAt = Date.now()
        const envelope: Envelope = {
          version: definition.version,
          writtenAt,
          ...(definition.ttl === undefined ? {} : { expiresAt: writtenAt + definition.ttl }),
          data: parsed.data,
        }
        try {
          localStorage.setItem(key, JSON.stringify(envelope))
          for (const listener of listeners) listener(parsed.data)
          return { ok: true }
        } catch (cause) {
          return { ok: false, error: new Error("Storage write failed", { cause }) }
        }
      }

      function storageListener(event: StorageEvent) {
        if (event.key !== key) return
        const value = inspect().value
        for (const listener of listeners) listener(value)
      }

      return {
        get: () => inspect().value,
        inspect,
        set,
        update: (change) => set(change(inspect().value)),
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) window.addEventListener("storage", storageListener)
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) window.removeEventListener("storage", storageListener)
          }
        },
      }
    },
  }
}

export const LocalStorage = { scope }
