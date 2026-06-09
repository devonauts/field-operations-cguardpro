import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
  build: {
    rollupOptions: {
      // @capacitor-firebase/messaging's WEB implementation imports the firebase
      // JS SDK (optional peer dep). We only use the native (iOS/Android) path —
      // the web chunk is never loaded — so keep firebase/* out of the bundle.
      external: [/^firebase(\/.*)?$/],
    },
  },
});
