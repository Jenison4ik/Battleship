import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Проксирование WebSocket соединений
      "/ws": {
        target: process.env.VITE_BACKEND_URL || "ws://localhost:18080",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path, // Оставляем путь как есть
      },
      // Проксирование HTTP API запросов (если будут использоваться)
      "/api": {
        target: (process.env.VITE_BACKEND_URL || "ws://localhost:18080")
          .replace(/^ws:\/\//, "http://")
          .replace(/^wss:\/\//, "https://"),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // Health check endpoint
      "/health": {
        target: (process.env.VITE_BACKEND_URL || "ws://localhost:18080")
          .replace(/^ws:\/\//, "http://")
          .replace(/^wss:\/\//, "https://"),
        changeOrigin: true,
      },
    },
  },
});
