import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: "src/background/index.ts",
      output: {
        entryFileNames: "background.js",
        format: "es",
      },
    },
  },
});
