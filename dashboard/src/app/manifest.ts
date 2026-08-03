import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MemorIAble",
    short_name: "MemorIAble",
    description: "Tus mensajes, categorizados y resumidos, en un vistazo.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6ef",
    theme_color: "#2f5d50",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
