import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeScript } from "@/components/ThemeScript";
import "./globals.css";

// Tipografía con carácter propio (no la fuente de sistema por defecto):
// Fraunces para titulares (serif cálida, misma familia visual que la
// landing) e Inter para el resto de la interfaz. next/font las autohospeda
// en el build: sin llamadas a un CDN en tiempo de ejecución.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MemorIAble · Dashboard",
  description: "Tus mensajes, categorizados y resumidos, en un vistazo.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MemorIAble",
  },
  other: {
    // Next.js 16 solo emite el tag moderno "mobile-web-app-capable".
    // iOS (versiones < 17.4) solo respeta este, con el prefijo "apple-":
    // sin él, "Añadir a pantalla de inicio" abre dentro de Safari en vez
    // de a pantalla completa.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#17160f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
      // El script del <head> fija data-theme/data-text-size en <html> ANTES
      // de que React hidrate — sin esto, React avisaría de un "mismatch"
      // porque el HTML servido no tiene esos atributos y el del navegador
      // sí. Mismo patrón que usan las librerías de tema (next-themes, etc).
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <OfflineBanner />
        {children}
        <ServiceWorkerRegister />
        {/* Gratis en el plan de Vercel ya usado; no necesitan ninguna clave —
            se activan solas al desplegar. Sin efecto ni coste en local/dev. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
