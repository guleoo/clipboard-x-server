import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/admin/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  build: { target: "es2022", sourcemap: true },
})
