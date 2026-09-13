import type { Administrator } from "../modules/identity/administrator"
import type { DeviceIdentity } from "../modules/device/device"

export interface HttpVariables {
  administrator: Administrator
  adminToken: string
  device: DeviceIdentity
}

export interface HttpEnvironment {
  Variables: HttpVariables
}
