import { verifySession } from "@/lib/dal";
import { Sidebar } from "@/components/nav/Sidebar";
import { BottomTabs } from "@/components/nav/BottomTabs";
import { MobileHeader } from "@/components/nav/MobileHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { UndoToastProvider } from "@/components/UndoToast";
import { AssistantProvider } from "@/components/AssistantProvider";
import { DailyBriefingModal } from "@/components/DailyBriefingModal";
import { getDailyBriefing } from "@/lib/dailyBriefing";
import { getActiveWorkspace, getPersonalWorkspaceId } from "@/lib/workspace";
import { listMyWorkspaces } from "@/app/(dashboard)/equipo/actions";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Comprobación "de verdad" (no solo la optimista de proxy.ts): si no hay
  // sesión válida, redirige a /login.
  const userId = await verifySession();
  // Workspace activo + lista de espacios: resuelto una vez aquí (no en cada
  // Sidebar/MobileHeader por separado) y pasado como prop — evita que cada
  // uno vuelva a consultar la BD para lo mismo en el mismo render.
  const [{ workspaceId: activeWorkspaceId, isPersonal }, workspaces] = await Promise.all([
    getActiveWorkspace(userId),
    listMyWorkspaces(),
  ]);
  // No crítico: si falla, el dashboard sigue funcionando igual, solo sin el
  // modal del resumen del día (no es un dato imprescindible para entrar).
  // Fase Equipo: SIEMPRE el workspace personal, nunca el activo (ver
  // getDailyBriefing en lib/dailyBriefing.ts) — "tu día" no cambia si
  // tienes seleccionado un workspace de equipo.
  const briefing = await getPersonalWorkspaceId(userId)
    .then((personalWorkspaceId) => getDailyBriefing(personalWorkspaceId))
    .catch((err) => {
      console.error("No se pudo calcular el resumen del día (no crítico):", err);
      return null;
    });

  return (
    <UndoToastProvider>
      {/* En el layout, no en /asistente: así el chat sigue respondiendo en
          segundo plano aunque se navegue a otra pantalla (ver el comentario
          en AssistantProvider.tsx). */}
      <AssistantProvider>
        <div className="flex min-h-screen flex-1">
          <Sidebar workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} isPersonal={isPersonal} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
            {/* pb-20 en móvil: deja hueco para la barra de pestañas fija (BottomTabs). */}
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-24 sm:px-6 sm:pb-6">
              {children}
            </main>
          </div>
          <BottomTabs isPersonal={isPersonal} />
          <CommandPalette />
          {briefing && <DailyBriefingModal userId={userId} data={briefing} />}
        </div>
      </AssistantProvider>
    </UndoToastProvider>
  );
}
