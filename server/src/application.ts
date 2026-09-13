import { AdministratorService as AuthService } from "./modules/identity/administrator"
import { ChannelService as ChannelsService } from "./modules/channel/channel"
import { ClipboardService } from "./modules/clipboard/item/item.service"
import { ClipboardRepo } from "./modules/clipboard/item/item.repo"
import { DeviceService as DevicesService } from "./modules/device/device"
import type { ServerConfig } from "./config"
import { ObjectStore } from "./modules/clipboard/object/object.store"
import { ApplicationDatabase } from "./db"
import { TransferService as TransfersService } from "./modules/transfer/transfer"
import { OverviewRepo, OverviewService } from "./modules/operations/overview"

export class Application {
  public readonly database: ApplicationDatabase
  public readonly objects: ObjectStore
  public readonly auth: AuthService
  public readonly devices: DevicesService
  public readonly channels: ChannelsService
  public readonly transfers: TransfersService
  public readonly clipboard: ClipboardService
  public readonly overview: OverviewService
  private closed = false

  private constructor(public readonly config: ServerConfig) {
    this.database = new ApplicationDatabase(config)
    this.objects = new ObjectStore(config.objectDirectory)
    this.auth = new AuthService(this.database, config)
    this.devices = new DevicesService(this.database, config)
    this.channels = new ChannelsService(this.database, config)
    this.transfers = new TransfersService(this.database)
    this.clipboard = new ClipboardService(
      new ClipboardRepo(this.database),
      this.objects,
      this.channels,
      this.transfers,
      config,
    )
    this.overview = new OverviewService(new OverviewRepo(this.database))
  }

  static async create(config: ServerConfig): Promise<Application> {
    const application = new Application(config)
    try {
      await application.objects.initialize()
      await application.auth.synchronize()
      await application.devices.synchronize()
      application.channels.synchronize()
      application.auth.purgeExpired()
      application.transfers.expire()
      return application
    } catch (error) {
      application.close()
      throw error
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.database.close()
  }
}
