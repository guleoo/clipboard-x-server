import { SafeTextSchema } from "../common/validation"
import { zz } from "../frame/zod"

export const CredentialsSchema = zz.object({
  username: SafeTextSchema(64).min(3),
  password: zz.string().min(7).max(256),
}).strict()
