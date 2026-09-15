import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"
import { TransferRepo, type TransferRow } from "../repo/transfer"

export type TransferState =
  | "queued"
  | "waiting-for-peer"
  | "transferring"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"

export interface Transfer {
  readonly id: string
  readonly itemId: string
  readonly deviceId: string
  readonly kind: "publish" | "content"
  readonly direction: "upload" | "download"
  readonly state: TransferState
  readonly completedBytes: number
  readonly totalBytes: number
  readonly peerDeviceIds: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly error: { readonly code: string; readonly message: string }
}

export interface CreateTransfer {
  readonly deviceId: string
  readonly itemId: string
  readonly kind: "publish" | "content"
  readonly direction: "upload" | "download"
  readonly state: TransferState
  readonly totalBytes: number
  readonly peerDeviceIds?: readonly string[]
  readonly expiresAt?: number
}

const terminal = new Set<TransferState>(["completed", "failed", "cancelled", "expired"])

function transferOf(row: TransferRow): Transfer {
  return {
    id: row.id,
    itemId: row.itemId,
    deviceId: row.deviceId,
    kind: row.kind as Transfer["kind"],
    direction: row.direction as Transfer["direction"],
    state: row.state as TransferState,
    completedBytes: row.completedBytes,
    totalBytes: row.totalBytes,
    peerDeviceIds: row.peerDeviceIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: { code: row.errorCode ?? "", message: row.errorMessage ?? "" },
  }
}

export class TransferService {
  readonly #repo = new TransferRepo()

  create(input: CreateTransfer): Transfer {
    const id = createId()
    const now = Date.now()
    this.#repo.create({
      id,
      deviceId: input.deviceId,
      itemId: input.itemId,
      kind: input.kind,
      direction: input.direction,
      state: input.state,
      completedBytes: 0,
      totalBytes: input.totalBytes,
      peerDeviceIds: input.peerDeviceIds ?? [],
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
    })
    return this.get(id)
  }

  get(id: string, deviceId?: string): Transfer {
    const row = this.#repo.get(id)
    if (!row || (deviceId && row.deviceId !== deviceId)) throw notFound("Transfer not found")
    return transferOf(row)
  }

  list(deviceId?: string, limit = 100): readonly Transfer[] {
    this.expire()
    return this.#repo.list(deviceId, limit).map(transferOf)
  }

  update(
    id: string,
    state: TransferState,
    completedBytes: number,
    error?: { readonly code: string; readonly message: string },
  ): Transfer {
    const current = this.get(id)
    if (terminal.has(current.state)) return current
    if (completedBytes < current.completedBytes || completedBytes > current.totalBytes) {
      throw new DomainError("invalid_request", "Transfer progress must be monotonic", 409)
    }
    if (state === "completed" && completedBytes !== current.totalBytes) {
      throw new DomainError("invalid_request", "Completed transfer must reach totalBytes", 409)
    }
    this.#repo.update(id, {
      state,
      completedBytes,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      updatedAt: Date.now(),
    })
    return this.get(id)
  }

  cancel(id: string, deviceId?: string): Transfer {
    const current = this.get(id, deviceId)
    if (terminal.has(current.state)) return current
    return this.update(id, "cancelled", current.completedBytes, { code: "cancelled", message: "Transfer cancelled" })
  }

  expire(): number {
    return this.#repo.expire(Date.now())
  }
}

export const transferService = new TransferService()
