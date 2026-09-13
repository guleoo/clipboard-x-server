import { DeviceIconSchema, SafeTextSchema, UuidSchema } from "../../../common/validation"
import { zz } from "../../../frame/zod"

export const DeviceProfileSchema = zz.object({
  tag: SafeTextSchema(256).min(1),
  iconKind: DeviceIconSchema,
}).strict()

export const DeviceCreateSchema = DeviceProfileSchema.extend({ id: UuidSchema })

export const DeviceUpdateSchema = zz.object({
  tag: SafeTextSchema(256).min(1).optional(),
  iconKind: DeviceIconSchema.optional(),
  disabled: zz.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required")
