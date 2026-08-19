import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
    // Three is the bulk of the payload; keep it in its own chunk so the page
    // shell and copy can paint before the WebGL work arrives.
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
  },
});
