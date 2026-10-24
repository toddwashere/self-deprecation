import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    cssMinify: true,
    minify: "esbuild",
  },
});
