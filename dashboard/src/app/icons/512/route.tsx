import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

// Icono grande para el manifest de la PWA (pantalla de instalación, splash).
// No depende de la request: se genera una vez en el build, no en cada
// petición.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(<AppIconMark fontSize={288} />, {
    width: 512,
    height: 512,
  });
}
