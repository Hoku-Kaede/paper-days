import type { MetadataRoute } from "next";

/* The web app: install it on a phone and the diary opens like a real
   app — its own icon, its own name, no browser chrome. */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ching's Diary ka ba?",
    short_name: "Ching's Diary",
    description:
      "A diary kept the scrapbook way — write on ruled paper, tape in photos and videos, and keep every page on every device.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#fbf6e8",
    theme_color: "#4d3a27",
    categories: ["lifestyle", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
