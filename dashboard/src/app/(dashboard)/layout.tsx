import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { Sidebar } from "@/components/nav/Sidebar";
import { BottomTabs } from "@/components/nav/BottomTabs";
import { MobileHeader } from "@/components/nav/MobileHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { UndoToastProvider } from "@/components/UndoToast";
import { AssistantProvider } from "@/components/AssistantProvider";
import { DailyBriefingModal } from "@/components/DailyBriefingModal";
import { CurrentTaskBar } from "@/components/CurrentTaskBar";
import { getDailyBriefing } from "@/lib/dailyBriefing";
import { getActiveWorkspace, getPersonalWorkspaceId, listWorkspaceMembers } from "@/lib/workspace";
import { listMyWorkspaces } from "@/app/(dashboard)/equipo/actions";
import { listNotifications, getUnreadCount } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Resumen del día + "en curso ahora" (Fase Equipo): deliberadamente FUERA
 * del `Promise.all` bloqueante de `DashboardLayout` — son un modal y un
 * widget flotante, ninguno de los dos hace falta para que la página en sí
 * (`children`) se pueda pintar. Antes bloqueaban TODA la respuesta del
 * servidor (TTFB) en CADA navegación por cifras que ni siquiera se ven de
 * inmediato — verificado en Vercel Speed Insights: TTFB de varios segundos
 * en rutas que no tocan nada de esto. Envuelto en `<Suspense>` en el
 * layout, este componente transmite (streaming) su HTML en cuanto está
 * listo, sin retrasar el resto.
 */
async function PeripheralWidgets({
  userId,
  activeWorkspaceId,
  isPersonal,
}: {
  userId: string;
  activeWorkspaceId: string;
  isPersonal: boolean;
}) {
  const [briefing, memberEmailById] = await Promise.all([
    // No crítico: si falla, el dashboard sigue funcionando igual, solo sin
    // el modal del resumen del día. Fase Equipo: SIEMPRE el workspace
    // personal, nunca el activo (ver getDailyBriefing en lib/dailyBriefing.ts)
    // — "tu día" no cambia si tienes seleccionado un workspace de equipo.
    getPersonalWorkspaceId(userId)
      .then((personalWorkspaceId) => getDailyBriefing(personalWorkspaceId))
      .catch((err) => {
        console.error("No se pudo calcular el resumen del día (no crítico):", err);
        return null;
      }),
    // Solo hace falta en modo equipo — en personal nadie más puede estar
    // "en curso" en nada. No crítico: si falla, `CurrentTaskBar` sigue
    // mostrando tu propia tarea activa, solo sin nombrar a nadie más.
    isPersonal
      ? Promise.resolve({})
      : listWorkspaceMembers(activeWorkspaceId, userId)
          .then((members) => Object.fromEntries(members.map((m) => [m.userId, m.email])))
          .catch((err) => {
            console.error("No se pudieron cargar los miembros del equipo para «en curso ahora» (no crítico):", err);
            return {};
          }),
  ]);

  return (
    <>
      {briefing && <DailyBriefingModal userId={userId} data={briefing} />}
      <CurrentTaskBar currentUserId={userId} memberEmailById={memberEmailById} />
    </>
  );
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Comprobación "de verdad" (no solo la optimista de proxy.ts): si no hay
  // sesión válida, redirige a /login.
  const userId = await verifySession();
  // Solo lo que hace falta para pintar la barra lateral/cabecera sin salto
  // visual (Sidebar/MobileHeader se ven de inmediato, sin skeleton) —
  // el resumen del día y "en curso ahora" ya NO están aquí, ver
  // `PeripheralWidgets` arriba.
  const [{ workspaceId: activeWorkspaceId, isPersonal }, workspaces, notifications, unreadCount, currentUser] =
    await Promise.all([
      getActiveWorkspace(userId),
      listMyWorkspaces(),
      listNotifications(userId, 8),
      getUnreadCount(userId),
      // Best-effort: solo decide si se muestra el enlace "Admin" en el
      // Sidebar, no es un dato imprescindible para poder entrar.
      prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }).catch(() => null),
    ]);
  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

  return (
    <UndoToastProvider>
      {/* En el layout, no en /asistente: así el chat sigue respondiendo en
          segundo plano aunque se navegue a otra pantalla (ver el comentario
          en AssistantProvider.tsx). */}
      <AssistantProvider>
        {/* Saltar al contenido: quien navega con teclado (o con lector de
            pantalla) tenía que pasar por TODO el menú lateral en cada
            página antes de llegar a lo que venía a leer. Invisible hasta
            que recibe el foco, que es justo cuando hace falta. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
        >
          Saltar al contenido
        </a>
        <div className="flex min-h-screen flex-1">
          <Sidebar
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            isPersonal={isPersonal}
            notifications={notifications}
            unreadCount={unreadCount}
            isSuperAdmin={isSuperAdmin}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              notifications={notifications}
              unreadCount={unreadCount}
            />
            {/* pb-20 en móvil: deja hueco para la barra de pestañas fija (BottomTabs). */}
            {/* tabIndex={-1}: sin esto, saltar aquí mueve la vista pero NO
                el foco del teclado, así que la siguiente tabulación
                volvería al menú — el salto no serviría de nada. */}
            <main
              id="contenido"
              tabIndex={-1}
              className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-24 focus-visible:outline-none sm:px-6 sm:pb-6"
            >
              {children}
            </main>
            <BottomTabs isPersonal={isPersonal} />
          </div>
          <CommandPalette />
          <Suspense fallback={null}>
            <PeripheralWidgets userId={userId} activeWorkspaceId={activeWorkspaceId} isPersonal={isPersonal} />
          </Suspense>
        </div>
      </AssistantProvider>
    </UndoToastProvider>
  );
}
