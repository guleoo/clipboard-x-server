import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

const envDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "")
  const proxyUrl = env.CBX_PROXY_URL
  if (!proxyUrl) throw new Error("CBX_PROXY_URL is required in web/.env")
  new URL(proxyUrl)

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      host: "127.0.0.1",
      port: 3000,
      proxy: {
        "/api": { target: proxyUrl, changeOrigin: true },
        "/admin/api": { target: proxyUrl, changeOrigin: true },
      },
    },
    build: { target: "es2022", sourcemap: true },
  }
})
