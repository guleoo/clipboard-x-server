import {
  ContentIdSchema,
  MimeTypeSchema,
  SafeTextSchema,
  Sha256Schema,
  UuidSchema,
} from "../common/validation"
import { zz, type RefinementCtx } from "../frame/zod"

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

const manifestFields = {
  id: UuidSchema,
  createdAt: zz.number().int().nonnegative(),
  contents: zz.array(RepresentationManifestSchema).min(1).max(16),
  previews: zz.array(PreviewManifestSchema).max(16).default([]),
} as const

function validateManifest(
  manifest: { readonly contents: readonly { readonly id: string }[]; readonly previews: readonly { readonly id: string; readonly contentId: string }[] },
  context: RefinementCtx,
): void {
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
}

export const ItemManifestSchema = zz.object({
  ...manifestFields,
  originDeviceId: UuidSchema,
}).strict().superRefine(validateManifest)

export const AdminItemManifestSchema = zz.object(manifestFields).strict().superRefine(validateManifest)

export const WorkRejectionSchema = zz.object({
  code: zz.enum(["source_content_missing", "upload_failed", "cancelled"]),
  message: SafeTextSchema(512).default(""),
}).strict()
