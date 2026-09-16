export const virtualDevice = Object.freeze({
  id: "00000000-0000-4000-8000-000000000001",
  tag: "Clipboard X Server",
  iconKind: "server" as const,
  iconColor: { light: "#ffffff" } as const,
})

export function isVirtualDevice(id: string): boolean {
  return id === virtualDevice.id
}
