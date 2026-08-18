import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const popupRoot = fileURLToPath(new URL("./src/popup", import.meta.url));

export default defineConfig({
  root: popupRoot,
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: resolve(popupRoot, "../../dist"),
    rollupOptions: {
      input: resolve(popupRoot, "popup.html"),
      output: {
        entryFileNames: "popup.js",
        assetFileNames: "popup.[ext]",
      },
    },
  },
});
