import type { Database } from "bun:sqlite"
import { DomainError } from "../common/error"
import { createId, createSecret, digestSecret } from "../common/identity"
import type { ServerConfig } from "../entry/config"

interface AdministratorRow {
  readonly id: number
  readonly username: string
  readonly password_hash: string
  readonly created_at: number
  readonly updated_at: number
}

interface SessionRow {
  readonly id: string
  readonly created_at: number
  readonly expires_at: number
  readonly last_seen_at: number
}

export interface Administrator {
  readonly id: 1
  readonly username: string
  readonly createdAt: number
}

export interface AdminSession {
  readonly token: string
  readonly expiresAt: number
  readonly administrator: Administrator
}

const passwordOptions = { algorithm: "argon2id", memoryCost: 65_536, timeCost: 3 } as const
const fallbackHash = "$argon2id$v=19$m=65536,t=3,p=1$sitgAOVTqhqcM/yU/ZD1M/bZiL9QFG9owjlvOcfV7sI$fSZBewiKp8+gWiRTdYm2IdOPM5cPfY8kUVgISh5eMco"

export class AuthService {
  constructor(
    private readonly database: Database,
    private readonly config: ServerConfig,
  ) {}

  async synchronize(): Promise<void> {
    const administrator = this.config.configuration.read().administrator
    const current = this.database.query<AdministratorRow, []>("SELECT * FROM administrators WHERE id = 1").get()
    const passwordMatches = current
      ? await Bun.password.verify(administrator.password, current.password_hash).catch(() => false)
      : false
    if (current?.username === administrator.username && passwordMatches) return
    const hash = await Bun.password.hash(administrator.password, passwordOptions)
    const now = Date.now()
    this.database.transaction(() => {
      this.database.query(
        `INSERT INTO administrators(id, username, password_hash, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username,
           password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      ).run(administrator.username, hash, current?.created_at ?? now, now)
      this.database.query("DELETE FROM admin_sessions").run()
    })()
  }

  async update(username: string, password: string): Promise<void> {
    const hash = await Bun.password.hash(password, passwordOptions)
    const now = Date.now()
    this.config.configuration.change(
      (configuration) => {
        configuration.administrator = { username, password }
      },
      () => {
        this.database.transaction(() => {
          this.database.query(
            "UPDATE administrators SET username = ?, password_hash = ?, updated_at = ? WHERE id = 1",
          ).run(username, hash, now)
          this.database.query("DELETE FROM admin_sessions").run()
        })()
      },
    )
  }

  async login(username: string, password: string): Promise<AdminSession> {
    const row = this.database.query<AdministratorRow, [string]>(
      "SELECT * FROM administrators WHERE id = 1 AND username = ?",
    ).get(username)
    const valid = await Bun.password.verify(password, row?.password_hash ?? fallbackHash).catch(() => false)
    if (!row || !valid) throw new DomainError("not_authenticated", "Username or password is incorrect", 401)
    return this.createSession()
  }

  authenticate(token: string | undefined): Administrator {
    if (!token) throw new DomainError("not_authenticated", "Administrator session is required", 401)
    const now = Date.now()
    const row = this.database.query<SessionRow & { username: string; admin_created_at: number }, [string, number]>(
      `SELECT s.id, s.created_at, s.expires_at, s.last_seen_at,
              a.username, a.created_at AS admin_created_at
       FROM admin_sessions s JOIN administrators a ON a.id = 1
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).get(digestSecret(token), now)
    if (!row) throw new DomainError("not_authenticated", "Administrator session is invalid or expired", 401)
    if (now - row.last_seen_at >= 60_000) {
      this.database.query("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?").run(now, row.id)
    }
    return { id: 1, username: row.username, createdAt: row.admin_created_at }
  }

  logout(token: string | undefined): void {
    if (token) this.database.query("DELETE FROM admin_sessions WHERE token_hash = ?").run(digestSecret(token))
  }

  purgeExpired(): number {
    return Number(this.database.query("DELETE FROM admin_sessions WHERE expires_at <= ?").run(Date.now()).changes)
  }

  private createSession(): AdminSession {
    const administrator = this.administrator()
    const token = createSecret()
    const now = Date.now()
    const expiresAt = now + this.config.sessionTtlMs
    this.database.query(
      "INSERT INTO admin_sessions(id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).run(createId(), digestSecret(token), now, expiresAt, now)
    return { token, expiresAt, administrator }
  }

  private administrator(): Administrator {
    const row = this.database.query<AdministratorRow, []>("SELECT * FROM administrators WHERE id = 1").get()
    if (!row) throw new DomainError("not_authenticated", "Administrator is not initialized", 401)
    return { id: 1, username: row.username, createdAt: row.created_at }
  }
}
