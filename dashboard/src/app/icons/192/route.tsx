import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

// Icono grande para el manifest de la PWA (no confundir con el favicon:
// icon.tsx/apple-icon.tsx cubren esos). 192x192 es el mínimo que exigen
// Chrome/Android para considerar la app instalable.
//
// No depende de la request: se genera una vez en el build, no en cada
// petición.
export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(<AppIconMark fontSize={108} />, {
    width: 192,
    height: 192,
  });
}
