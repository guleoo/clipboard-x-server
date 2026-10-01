import { describe, expect, test } from "bun:test";
import { Client } from "../../src/api/client";
import type { Bound, Call, Endpoint } from "../../src/frame/request";

describe("device key administration", () => {
  test("registers DeviceId before issuing and revoking its bound keys", async () => {
    const calls: { readonly operation: string; readonly input: Call }[] = []
    const request = {
      bind<Input extends Call, Output>(endpoint: Endpoint<Input, Output>): Bound<Input, Output> {
        return (async (input: Input) => {
          calls.push({ operation: endpoint.operation, input })
          return {} as Output
        }) as Bound<Input, Output>
      },
    }
    const api = Client.create(request as Parameters<typeof Client.create>[0])

    await api.createDevice("client-device")
    await api.issueDeviceKey("client-device")
    await api.revokeDeviceKey("client-device", "key-id")

    expect(calls).toEqual([
      { operation: "devices.create", input: { body: { id: "client-device" } } },
      { operation: "deviceKeys.issue", input: { path: { id: "client-device" }, body: {} } },
      { operation: "deviceKeys.revoke", input: { path: { deviceId: "client-device", keyId: "key-id" } } },
    ])
  })
});
