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
    // Hace que MemorIAble aparezca en el menú "Compartir" del sistema
    // (Android) — compartir un enlace o un texto seleccionado desde
    // CUALQUIER otra app lo guarda directamente, sin cambiar de app para
    // pegarlo a mano. Ver el handler en api/share-target/route.ts.
    share_target: {
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
