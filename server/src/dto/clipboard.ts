import {
  ContentIdSchema,
  MimeTypeSchema,
  SafeTextSchema,
  Sha256Schema,
  UuidSchema,
} from "../common/validation"
import { zz } from "../frame/zod"

export const RepresentationManifestSchema = zz.object({
  id: ContentIdSchema,
  mimeType: MimeTypeSchema,
  size: zz.number().int().nonnegative(),
  sha256: Sha256Schema,
  delivery: zz.enum(["eager", "on-demand"]),
}).strict()

export const PreviewManifestSchema = zz.object({
  id: ContentIdSchema,
  contentId: ContentIdSchema,
  mimeType: MimeTypeSchema,
  size: zz.number().int().nonnegative(),
  sha256: Sha256Schema,
  truncated: zz.boolean(),
}).strict()

export const ItemManifestSchema = zz.object({
  id: UuidSchema,
  createdAt: zz.number().int().nonnegative(),
  originDeviceId: UuidSchema,
  contents: zz.array(RepresentationManifestSchema).min(1).max(16),
  previews: zz.array(PreviewManifestSchema).max(16).default([]),
}).strict().superRefine((manifest, context) => {
  const contents = new Set(manifest.contents.map((value) => value.id))
  if (contents.size !== manifest.contents.length) {
    context.addIssue({ code: "custom", path: ["contents"], message: "Content IDs must be unique" })
  }
  const previews = new Set(manifest.previews.map((value) => value.id))
  if (previews.size !== manifest.previews.length) {
    context.addIssue({ code: "custom", path: ["previews"], message: "Preview IDs must be unique" })
  }
  for (const [index, preview] of manifest.previews.entries()) {
    if (!contents.has(preview.contentId)) {
      context.addIssue({ code: "custom", path: ["previews", index, "contentId"], message: "Preview contentId is unknown" })
    }
  }
})

export const WorkRejectionSchema = zz.object({
  code: zz.enum(["source_content_missing", "upload_failed", "cancelled"]),
  message: SafeTextSchema(512).default(""),
}).strict()
