import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "TNWWWidget",
      formats: ["iife"],
      fileName: () => "tnww-widget.js",
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "tnww-widget.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
