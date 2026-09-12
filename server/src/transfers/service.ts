import type { Database } from "bun:sqlite"
import { DomainError, notFound } from "../common/error"
import { createId } from "../common/identity"

export type TransferState =
  | "queued"
  | "waiting-for-peer"
  | "transferring"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"

interface TransferRow {
  readonly id: string
  readonly device_id: string
  readonly item_id: string
  readonly kind: "publish" | "content"
  readonly direction: "upload" | "download"
  readonly state: TransferState
  readonly completed_bytes: number
  readonly total_bytes: number
  readonly peer_device_ids: string
  readonly error_code: string | null
  readonly error_message: string | null
  readonly created_at: number
  readonly updated_at: number
  readonly expires_at: number | null
}

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
    itemId: row.item_id,
    deviceId: row.device_id,
    kind: row.kind,
    direction: row.direction,
    state: row.state,
    completedBytes: row.completed_bytes,
    totalBytes: row.total_bytes,
    peerDeviceIds: JSON.parse(row.peer_device_ids) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: { code: row.error_code ?? "", message: row.error_message ?? "" },
  }
}

export class TransfersService {
  constructor(private readonly database: Database) {}

  create(input: CreateTransfer): Transfer {
    const id = createId()
    const now = Date.now()
    this.database.query(
      `INSERT INTO transfers(
        id, device_id, item_id, kind, direction, state, completed_bytes, total_bytes,
        peer_device_ids, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.deviceId,
      input.itemId,
      input.kind,
      input.direction,
      input.state,
      input.totalBytes,
      JSON.stringify(input.peerDeviceIds ?? []),
      now,
      now,
      input.expiresAt ?? null,
    )
    return this.get(id)
  }

  get(id: string, deviceId?: string): Transfer {
    const row = this.database.query<TransferRow, [string]>("SELECT * FROM transfers WHERE id = ?").get(id)
    if (!row || (deviceId && row.device_id !== deviceId)) throw notFound("Transfer not found")
    return transferOf(row)
  }

  list(deviceId?: string, limit = 100): readonly Transfer[] {
    this.expire()
    const rows = deviceId
      ? this.database.query<TransferRow, [string, number]>(
          "SELECT * FROM transfers WHERE device_id = ? ORDER BY updated_at DESC LIMIT ?",
        ).all(deviceId, limit)
      : this.database.query<TransferRow, [number]>(
          "SELECT * FROM transfers ORDER BY updated_at DESC LIMIT ?",
        ).all(limit)
    return rows.map(transferOf)
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
    this.database.query(
      `UPDATE transfers SET state = ?, completed_bytes = ?, error_code = ?, error_message = ?, updated_at = ?
       WHERE id = ?`,
    ).run(state, completedBytes, error?.code ?? null, error?.message ?? null, Date.now(), id)
    return this.get(id)
  }

  cancel(id: string, deviceId?: string): Transfer {
    const current = this.get(id, deviceId)
    if (terminal.has(current.state)) return current
    return this.update(id, "cancelled", current.completedBytes, { code: "cancelled", message: "Transfer cancelled" })
  }

  expire(): number {
    const now = Date.now()
    return Number(this.database.query(
      `UPDATE transfers SET state = 'expired', error_code = 'transfer_expired',
       error_message = 'Transfer expired', updated_at = ?
       WHERE expires_at IS NOT NULL AND expires_at <= ?
         AND state NOT IN ('completed', 'failed', 'cancelled', 'expired')`,
    ).run(now, now).changes)
  }
}
