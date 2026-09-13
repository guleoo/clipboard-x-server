import { SafeTextSchema } from "../../../common/validation"
import { zz } from "../../../frame/zod"

export const ChannelInputSchema = zz.object({
  name: SafeTextSchema(256).min(1),
}).strict()
