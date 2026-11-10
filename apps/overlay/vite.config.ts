import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: path.resolve(import.meta.dirname, "../.."),
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5181,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5181,
    strictPort: true,
  },
});
