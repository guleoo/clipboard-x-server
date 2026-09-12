import { AuthService } from "./auth/service"
import { ChannelsService } from "./channels/service"
import { ClipboardService } from "./clipboard/service"
import { DevicesService } from "./devices/service"
import type { ServerConfig } from "./entry/config"
import { ObjectStore } from "./infrastructure/objects/store"
import { SqliteDatabase } from "./infrastructure/sqlite/database"
import { TransfersService } from "./transfers/service"

export class Application {
  public readonly database: SqliteDatabase
  public readonly objects: ObjectStore
  public readonly auth: AuthService
  public readonly devices: DevicesService
  public readonly channels: ChannelsService
  public readonly transfers: TransfersService
  public readonly clipboard: ClipboardService

  private constructor(public readonly config: ServerConfig) {
    this.database = new SqliteDatabase(config.databasePath)
    this.objects = new ObjectStore(config.objectDirectory)
    this.auth = new AuthService(this.database.raw, config)
    this.devices = new DevicesService(this.database.raw, config)
    this.channels = new ChannelsService(this.database.raw, config)
    this.transfers = new TransfersService(this.database.raw)
    this.clipboard = new ClipboardService(
      this.database.raw,
      this.objects,
      this.channels,
      this.transfers,
      config,
    )
  }

  static async create(config: ServerConfig): Promise<Application> {
    const application = new Application(config)
    await application.objects.initialize()
    await application.auth.synchronize()
    await application.devices.synchronize()
    application.channels.synchronize()
    application.auth.purgeExpired()
    application.transfers.expire()
    return application
  }

  close(): void {
    this.database.close()
  }
}
