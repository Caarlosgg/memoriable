import { verifySession } from "@/lib/dal";
import { Sidebar } from "@/components/nav/Sidebar";
import { BottomTabs } from "@/components/nav/BottomTabs";
import { MobileHeader } from "@/components/nav/MobileHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { UndoToastProvider } from "@/components/UndoToast";
import { AssistantProvider } from "@/components/AssistantProvider";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Comprobación "de verdad" (no solo la optimista de proxy.ts): si no hay
  // sesión válida, redirige a /login.
  await verifySession();

  return (
    <UndoToastProvider>
      {/* En el layout, no en /asistente: así el chat sigue respondiendo en
          segundo plano aunque se navegue a otra pantalla (ver el comentario
          en AssistantProvider.tsx). */}
      <AssistantProvider>
        <div className="flex min-h-screen flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader />
            {/* pb-20 en móvil: deja hueco para la barra de pestañas fija (BottomTabs). */}
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-24 sm:px-6 sm:pb-6">
              {children}
            </main>
          </div>
          <BottomTabs />
          <CommandPalette />
        </div>
      </AssistantProvider>
    </UndoToastProvider>
  );
}
