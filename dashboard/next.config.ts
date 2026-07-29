import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Este repo tiene otro package-lock.json en la raíz (el bot de Telegram).
  // Fija explícitamente la raíz para que Turbopack no intente adivinarla.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
