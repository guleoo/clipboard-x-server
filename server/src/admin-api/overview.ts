import type { Database } from "bun:sqlite"

export function overview(database: Database): Readonly<Record<string, unknown>> {
  const scalar = (sql: string): number => Number(
    database.query<{ count: number }, []>(sql).get()?.count ?? 0,
  )
  const recent = database.query<{
    id: string
    item_id: string
    state: string
    kind: string
    direction: string
    updated_at: number
  }, []>("SELECT id, item_id, state, kind, direction, updated_at FROM transfers ORDER BY updated_at DESC LIMIT 8").all()
  return {
    devices: {
      total: scalar("SELECT count(*) AS count FROM devices WHERE deleted_at IS NULL"),
      online: Number(database.query<{ count: number }, [number]>(
        "SELECT count(*) AS count FROM devices WHERE deleted_at IS NULL AND disabled_at IS NULL AND last_seen_at >= ?",
      ).get(Date.now() - 2 * 60 * 1000)?.count ?? 0),
      disabled: scalar("SELECT count(*) AS count FROM devices WHERE deleted_at IS NULL AND disabled_at IS NOT NULL"),
    },
    channels: scalar("SELECT count(*) AS count FROM channels WHERE deleted_at IS NULL"),
    items: scalar("SELECT count(*) AS count FROM clipboard_items WHERE visible = 1 AND deleted_at IS NULL"),
    failedTransfers: scalar("SELECT count(*) AS count FROM transfers WHERE state IN ('failed', 'expired')"),
    recentTransfers: recent.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      state: row.state,
      kind: row.kind,
      direction: row.direction,
      updatedAt: row.updated_at,
    })),
  }
}
