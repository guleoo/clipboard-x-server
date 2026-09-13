export { main } from "./entry/main"

if (import.meta.main) {
  const { main } = await import("./entry/main")
  await main()
}
