import { sql } from "drizzle-orm"
import { sqliteValue } from "../common/sqlite"
import { db } from "../db"

export interface CollectableObject {
  readonly id: string
  readonly sha256: string
  readonly path: string
  readonly size: number
}

export class ObjectGcRepo {
  private filter(cutoff: number) {
    return sql`o.ref_count = 0 AND o.unreferenced_at IS NOT NULL AND o.unreferenced_at <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM representations r WHERE r.object_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM previews p WHERE p.object_id = o.id)
      AND NOT EXISTS (SELECT 1 FROM upload_objects u WHERE u.stored_object_id = o.id)`
  }

  plan(cutoff: number): { readonly objectCount: number; readonly objectBytes: number } {
    const result = sqliteValue(db.all<{ count: number; bytes: number }>(sql`
      SELECT count(*) AS count, COALESCE(sum(o.size), 0) AS bytes FROM objects o WHERE ${this.filter(cutoff)}
    `))[0]
    return { objectCount: result?.count ?? 0, objectBytes: result?.bytes ?? 0 }
  }

  candidates(cutoff: number, limit: number): readonly CollectableObject[] {
    return sqliteValue(db.all<CollectableObject>(sql`
      SELECT o.id, o.sha256, o.path, o.size FROM objects o WHERE ${this.filter(cutoff)}
      ORDER BY o.unreferenced_at, o.id LIMIT ${limit}
    `))
  }

  delete(id: string, cutoff: number): boolean {
    return db.all<{ id: string }>(sql`
      DELETE FROM objects AS o WHERE o.id = ${id} AND ${this.filter(cutoff)} RETURNING id
    `).length > 0
  }
}
