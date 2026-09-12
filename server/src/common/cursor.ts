import { DomainError } from "./error"

interface CursorPayload {
  readonly version: 1
  readonly sequence: number
}

export namespace Cursor {
  export function encode(sequence: number): string {
    const payload: CursorPayload = { version: 1, sequence }
    return Buffer.from(JSON.stringify(payload)).toString("base64url")
  }

  export function decode(value: string | undefined): number {
    if (!value) return 0
    if (value.length > 256) throw new DomainError("invalid_request", "Cursor is too long", 400)
    try {
      const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorPayload>
      if (payload.version !== 1 || !Number.isSafeInteger(payload.sequence) || (payload.sequence ?? -1) < 0) {
        throw new Error("invalid payload")
      }
      return payload.sequence as number
    } catch (cause) {
      throw new DomainError("invalid_request", "Cursor is invalid", 400, undefined, { cause })
    }
  }
}
