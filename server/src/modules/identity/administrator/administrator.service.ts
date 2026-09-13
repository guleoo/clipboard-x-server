import type { ServerConfig } from "../../../config"
import { DomainError } from "../../../common/error"
import { createId, createSecret, digestSecret } from "../../../common/identity"
import { Password } from "../../../frame/security/password"
import type { ApplicationDatabase } from "../../../db"
import { AdministratorRepo } from "./administrator.repo"

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

const fallbackHash = "$argon2id$v=19$m=65536,t=3,p=1$sitgAOVTqhqcM/yU/ZD1M/bZiL9QFG9owjlvOcfV7sI$fSZBewiKp8+gWiRTdYm2IdOPM5cPfY8kUVgISh5eMco"

export class AdministratorService {
  readonly #repo: AdministratorRepo

  constructor(
    private readonly database: ApplicationDatabase,
    private readonly config: ServerConfig,
  ) {
    this.#repo = new AdministratorRepo(database)
  }

  async synchronize(): Promise<void> {
    const configured = this.config.configuration.read().administrator
    const current = this.#repo.administrator()
    const matches = current
      ? await Password.verify(configured.password, current.passwordHash)
      : false
    if (current?.username === configured.username && matches) return
    const hash = await this.hash(configured.password)
    const now = Date.now()
    this.database.transaction(() => {
      this.#repo.saveAdministrator({
        username: configured.username,
        passwordHash: hash,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      })
      this.#repo.clearSessions()
    })
  }

  async update(username: string, password: string): Promise<void> {
    const hash = await this.hash(password)
    this.config.configuration.change(
      (configuration) => {
        configuration.administrator = { username, password }
      },
      () => this.database.transaction(() => {
        this.#repo.updateAdministrator(username, hash, Date.now())
        this.#repo.clearSessions()
      }),
    )
  }

  async login(username: string, password: string): Promise<AdminSession> {
    const row = this.#repo.administratorByUsername(username)
    const valid = await Password.verify(password, row?.passwordHash ?? fallbackHash)
    if (!row || !valid) {
      throw new DomainError("not_authenticated", "Username or password is incorrect", 401)
    }
    return this.createSession()
  }

  authenticate(token: string | undefined): Administrator {
    if (!token) throw new DomainError("not_authenticated", "Administrator session is required", 401)
    const now = Date.now()
    const row = this.#repo.session(digestSecret(token), now)
    if (!row) {
      throw new DomainError("not_authenticated", "Administrator session is invalid or expired", 401)
    }
    if (now - row.lastSeenAt >= 60_000) this.#repo.touchSession(row.id, now)
    return { id: 1, username: row.username, createdAt: row.administratorCreatedAt }
  }

  logout(token: string | undefined): void {
    if (token) this.#repo.deleteSession(digestSecret(token))
  }

  purgeExpired(): number {
    return this.#repo.purgeExpiredSessions(Date.now())
  }

  private createSession(): AdminSession {
    const administrator = this.administrator()
    const token = createSecret(this.config.sessionTokenBytes)
    const now = Date.now()
    const expiresAt = now + this.config.sessionTtlMs
    this.#repo.createSession({
      id: createId(),
      tokenHash: digestSecret(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    })
    return { token, expiresAt, administrator }
  }

  private administrator(): Administrator {
    const row = this.#repo.administrator()
    if (!row) throw new DomainError("not_authenticated", "Administrator is not initialized", 401)
    return { id: 1, username: row.username, createdAt: row.createdAt }
  }

  private hash(password: string): Promise<string> {
    return Password.hash(password, {
      memoryCost: this.config.passwordMemoryCost,
      timeCost: this.config.passwordTimeCost,
    })
  }
}
