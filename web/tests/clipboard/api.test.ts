import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { Client } from "../../src/api/client";
import type { Publication, Transfer } from "../../src/api/schemas";
import type { Bound, Call, Endpoint } from "../../src/frame/request";
const identifier = "00000000-0000-4000-8000-000000000010"
const uploadId = "00000000-0000-4000-8000-000000000011"
const transferId = "00000000-0000-4000-8000-000000000012"
function transfer(state: Transfer["state"]): Transfer {
  return {
    id: transferId,
    itemId: identifier,
    deviceId: "00000000-0000-4000-8000-000000000001",
    kind: "publish",
    direction: "upload",
    state,
    completedBytes: state === "completed" ? 7 : 0,
    totalBytes: 7,
    peerDeviceIds: [],
    createdAt: 1,
    updatedAt: 1,
    error: { code: "", message: "" },
  }
}

describe("admin clipboard publication", () => {
  test("creates an eager manifest, uploads preview and content, then completes", async () => {
    const calls: { readonly operation: string; readonly input: Call }[] = []
    const publication: Publication = {
      itemId: identifier,
      uploadId,
      previewIds: ["preview"],
      contentIds: ["primary"],
      transfer: transfer("queued"),
    }
    const responses: Readonly<Record<string, unknown>> = {
      "items.create": publication,
      "previews.upload": { size: 2, sha256: "preview" },
      "contents.upload": { size: 5, sha256: "content" },
      "uploads.complete": { transfer: transfer("completed") },
    }
    const request = {
      bind<Input extends Call, Output>(endpoint: Endpoint<Input, Output>): Bound<Input, Output> {
        return (async (input: Input) => {
          calls.push({ operation: endpoint.operation, input })
          return responses[endpoint.operation] as Output
        }) as Bound<Input, Output>
      },
    }
    const api = Client.create(request as Parameters<typeof Client.create>[0])
    const content = new Blob(["hello"], { type: "text/plain;charset=utf-8" })
    const preview = new Blob(["he"], { type: "text/plain;charset=utf-8" })

    const result = await api.publish("channel-1", {
      content,
      preview: { content: preview, truncated: true },
    })

    expect(calls.map(({ operation }) => operation)).toEqual([
      "items.create", "previews.upload", "contents.upload", "uploads.complete",
    ])
    const manifest = calls[0]!.input.body as Record<string, unknown>
    expect(manifest).not.toHaveProperty("originDeviceId")
    expect(manifest.contents).toEqual([expect.objectContaining({
      id: "primary",
      delivery: "eager",
      size: 5,
      sha256: createHash("sha256").update("hello").digest("hex"),
    })])
    expect(manifest.previews).toEqual([expect.objectContaining({
      id: "preview",
      contentId: "primary",
      truncated: true,
      sha256: createHash("sha256").update("he").digest("hex"),
    })])
    expect(calls[1]!.input).toMatchObject({
      body: preview,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      timeoutMillis: 120_000,
    })
    expect(calls[2]!.input).toMatchObject({
      body: content,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      timeoutMillis: 120_000,
    })
    expect(result.transfer.state).toBe("completed")
  })
});
