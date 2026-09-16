import { DeviceIconSchema, SafeTextSchema, UuidSchema } from "../common/validation"
import { zz } from "../frame/zod"

export const DeviceProfileSchema = zz.object({
  tag: SafeTextSchema(256).min(1),
  iconKind: DeviceIconSchema,
}).strict()

export const DeviceCreateSchema = zz.object({ id: UuidSchema }).strict()

export const DeviceUpdateSchema = zz.object({
  disabled: zz.boolean(),
}).strict()
