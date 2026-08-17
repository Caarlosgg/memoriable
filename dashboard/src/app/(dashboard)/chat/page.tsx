import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace, listWorkspaceMembers } from "@/lib/workspace";
import { listConversations, listChatMessages } from "./actions";
import { ChatShell } from "@/components/chat/ChatShell";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Chat · MemorIAble" };

export default async function ChatPage({
  searchParams,
}: {
  // `?c=<id>`: abrir una conversación concreta al llegar — lo usa el botón
  // de "escribir" del equipo, que crea/reutiliza el hilo y trae aquí
  // directamente en vez de dejar al usuario buscándolo en la lista.
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: conversacionPedida } = await searchParams;
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);

  return (
    <>
      <PageHeader
        title="Chat"
        help={
          <>
            Habla en individual con quien quieras del equipo, o crea grupos — como un gestor de mensajería. El
            grupo &quot;Equipo&quot; incluye a todos por defecto. Se actualiza solo, sin recargar la página.
          </>
        }
      />
      <ActiveWorkspaceBadge />

      {isPersonal ? (
        <div className="rounded-xl border border-dashed border-paper-line bg-paper-raised/60 p-8 text-center">
          <p className="text-muted">
            El chat de equipo no está disponible en tu espacio personal — cámbiate a un equipo desde el selector
            para usarlo.
          </p>
        </div>
      ) : (
        <ChatSection workspaceId={workspaceId} currentUserId={userId} conversacionPedida={conversacionPedida} />
      )}
    </>
  );
}

async function ChatSection({
  workspaceId,
  currentUserId,
  conversacionPedida,
}: {
  workspaceId: string;
  currentUserId: string;
  conversacionPedida?: string;
}) {
  const [conversations, members] = await Promise.all([
    listConversations(),
    listWorkspaceMembers(workspaceId, currentUserId),
  ]);
  // Solo se respeta `?c=` si de verdad es una conversación suya — así un id
  // inventado en la URL no deja la pantalla en blanco, simplemente abre la
  // primera como siempre.
  const initialSelectedId =
    (conversacionPedida && conversations.some((c) => c.id === conversacionPedida) ? conversacionPedida : null) ??
    conversations[0]?.id ??
    null;
  const initialMessages = initialSelectedId ? await listChatMessages(initialSelectedId) : [];
  return (
    <ChatShell
      initialConversations={conversations}
      initialSelectedId={initialSelectedId}
      initialMessages={initialMessages}
      members={members}
      currentUserId={currentUserId}
    />
  );
}
