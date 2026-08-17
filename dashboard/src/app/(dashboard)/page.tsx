import { redirect } from "next/navigation";

/**
 * La pantalla de inicio es "hoy de un vistazo" (ver components/inicio/
 * TodayView.tsx), no el Asistente: entrar y encontrarte un chat vacío no
 * te dice qué tienes pendiente, qué vence hoy ni en qué anda el equipo.
 *
 * Sigue siendo una redirección (y no la propia página) para que /inicio
 * tenga una URL propia a la que enlazar desde el menú.
 */
export default function DashboardRootPage() {
  redirect("/inicio");
}
