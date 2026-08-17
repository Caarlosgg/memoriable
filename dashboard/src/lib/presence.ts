/**
 * Sin "server-only" a propósito: `isOnline` es pura (sin cookies/Prisma) y
 * la usan tanto Server Components (workspace.ts la reexporta) como Client
 * Components (ConversationThread.tsx, para pintar el punto de "en línea") — si
 * viviera en workspace.ts, importarla desde un Client Component arrastraría
 * todo ese módulo (cookies, Prisma) al bundle del navegador y rompería el
 * build.
 */

/** Sin latido en los últimos 90s (CurrentTaskBar sondea cada 20s en modo equipo), se considera desconectado. */
export const ONLINE_THRESHOLD_MS = 90_000;

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}
