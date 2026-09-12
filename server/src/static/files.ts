import { extname, resolve, sep } from "node:path"
import { DomainError } from "../common/error"

export async function staticFile(webRoot: string, requestPath: string): Promise<Response | undefined> {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    throw new DomainError("invalid_request", "Request path is malformed", 400)
  }
  const requested = decoded === "/" || !extname(decoded) ? "index.html" : decoded.replace(/^\/+/, "")
  const root = resolve(webRoot)
  const path = resolve(root, requested)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new DomainError("invalid_request", "Static path is invalid", 400)
  }
  let file = Bun.file(path)
  if (!(await file.exists()) && requested !== "index.html") return undefined
  if (!(await file.exists())) return undefined
  const hashedAsset = /-[A-Za-z0-9_-]{8,}\./u.test(requested)
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": requested === "index.html"
        ? "no-cache"
        : hashedAsset ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
