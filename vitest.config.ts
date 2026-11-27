import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Include back-end regression tests: settlement, R2 permissions, PDFs and workers.
    // Previously only src/ ran, leaving server/*.test.ts invisible to CI.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "server/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
