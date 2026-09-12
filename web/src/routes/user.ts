import { z } from "zod"
import type { Node } from "@/frame/router/core"

const NodeSchema: z.ZodType<Node> = z.lazy(() => z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string(),
  title: z.string().min(1),
  component: z.string().min(1).optional(),
  redirect: z.string().min(1).optional(),
  layout: z.enum(["normal", "empty"]).optional(),
  index: z.boolean().optional(),
  order: z.number().optional(),
  show: z.boolean().optional(),
  disabled: z.boolean().optional(),
  flat: z.boolean().optional(),
  keepAlive: z.boolean().optional(),
  parentId: z.string().min(1).optional(),
  children: z.array(NodeSchema).optional(),
}).readonly())

export function parse(value: unknown): readonly Node[] { return z.array(NodeSchema).parse(value) }
