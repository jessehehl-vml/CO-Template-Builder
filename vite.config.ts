import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  root: "src/webview",

  base: "./",

  build: {
    outDir: "../../webview-dist",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/webview/index.html"),
        wizard: path.resolve(__dirname, "src/webview/wizard.html"),
      },
    },
  },
});
