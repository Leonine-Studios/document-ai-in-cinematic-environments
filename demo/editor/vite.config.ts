import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { daiceExtensionBridge } from "./vite-plugins/daiceExtensionBridge";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// The Phase 3 viewer template (../viewer/) and the Phase 1 demo package
// (../examples/demo-package/) live outside this package's own directory (see
// src/io/exportZip.ts and src/io/demoPackage.ts, which import them via
// `?raw`/glob imports). Vite's dev server otherwise refuses to serve files
// outside the project root, so the daice-chain package root is allow-listed
// explicitly rather than duplicating those files into a copy that could
// drift out of sync.
const daiceRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  plugins: [react(), daiceExtensionBridge()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    fs: {
      allow: [rootDir, daiceRoot],
    },
  },
});
