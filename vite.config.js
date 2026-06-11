import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://jmoughon.github.io/baseball-tracker/
export default defineConfig({
  base: "/baseball-tracker/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Scout Book — Baseball Scout Tracker",
        short_name: "Scout Book",
        description:
          "Chart opposing batters from the stands: spray charts, timing, and tendencies. Works offline; data stays on your device.",
        theme_color: "#1B2A41",
        background_color: "#FAFAF7",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
