import type { CSSProperties } from "react"
import type { Device } from "@/api"

const deviceIcons: Readonly<Record<string, string>> = {
  computer: "computer-symbolic.svg",
  laptop: "laptop-symbolic.svg",
  tablet: "tablet-symbolic.svg",
  server: "server-symbolic.svg",
  android: "android-fill-symbolic.svg",
  apple: "apple-fill-symbolic.svg",
  windows: "windows-fill-symbolic.svg",
  linux: "linux-symbolic.svg",
  debian: "debian-symbolic.svg",
  archlinux: "archlinux-symbolic.svg",
}

function darkIconColor(light: string): string {
  const channels = [1, 3, 5].map((index) => Number.parseInt(light.slice(index, index + 2), 16))
  const highest = Math.max(...channels)
  const scale = highest > 96 ? 96 / highest : 1
  return `#${channels.map((value) => Math.round(value * scale).toString(16).padStart(2, "0")).join("")}`
}

export function DeviceIcon({ device, className = "size-5" }: {
  readonly device: Pick<Device, "iconKind" | "iconColor">
  readonly className?: string
}) {
  const icon = Object.hasOwn(deviceIcons, device.iconKind)
    ? deviceIcons[device.iconKind]
    : deviceIcons.computer
  const colors = {
    "--device-icon-light": device.iconColor.dark ?? darkIconColor(device.iconColor.light),
    "--device-icon-dark": device.iconColor.light,
    maskImage: `url("/icons/device/${icon}")`,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
  } as CSSProperties

  return <span className={`${className} shrink-0 bg-[var(--device-icon-light)] dark:bg-[var(--device-icon-dark)]`}
    style={colors} aria-hidden="true" />
}
