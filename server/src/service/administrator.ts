import { DomainError } from "../common/error"
import { config } from "../config"
import { db } from "../db"
import { Password } from "../frame/security/password"
import { AdministratorRepo } from "../repo/administrator"
import { Session } from "../session"

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
  readonly #repo = new AdministratorRepo()

  async synchronize(): Promise<void> {
    const configured = config.read().administrator
    const current = this.#repo.administrator()
    const matches = current
      ? await Password.verify(configured.password, current.passwordHash)
      : false
    if (current?.username === configured.username && matches) return
    const hash = await this.hash(configured.password)
    const now = Date.now()
    db.transaction(() => {
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
    config.change(
      (configuration) => {
        configuration.administrator = { username, password }
      },
      () => db.transaction(() => {
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
    const administrator = this.administrator()
    const credential = Session.create({ uid: "administrator", ttlMillis: config.sessionTtlMillis })
    return {
      token: credential.token,
      expiresAt: credential.session.expiresAt,
      administrator,
    }
  }

  authenticate(token: string | undefined): Administrator {
    if (!token) throw new DomainError("not_authenticated", "Administrator session is required", 401)
    const session = Session.resolve(token)
    if (!session || session.uid !== "administrator") {
      throw new DomainError("not_authenticated", "Administrator session is invalid or expired", 401)
    }
    return this.administrator()
  }

  logout(sessionId: string | undefined): void {
    if (sessionId) Session.revoke(sessionId)
  }

  purgeExpired(): number {
    return Session.purgeExpired()
  }

  current(): Administrator {
    return this.administrator()
  }

  private administrator(): Administrator {
    const row = this.#repo.administrator()
    if (!row) throw new DomainError("not_authenticated", "Administrator is not initialized", 401)
    return { id: 1, username: row.username, createdAt: row.createdAt }
  }

  private hash(password: string): Promise<string> {
    return Password.hash(password)
  }
}

export const administratorService = new AdministratorService()
