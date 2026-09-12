import type { Administrator } from "../auth/service"
import type { DeviceIdentity } from "../devices/service"

export interface HttpVariables {
  requestId: string
  administrator: Administrator
  adminToken: string
  device: DeviceIdentity
}

export interface HttpEnvironment {
  Variables: HttpVariables
}
