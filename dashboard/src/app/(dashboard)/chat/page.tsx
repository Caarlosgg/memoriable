import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { getActiveWorkspace } from "@/lib/workspace";
import { listChatMessages } from "./actions";
import { TeamChatView } from "@/components/chat/TeamChatView";
import { PageHeader } from "@/components/PageHeader";
import { ActiveWorkspaceBadge } from "@/components/ActiveWorkspaceBadge";

export const metadata: Metadata = { title: "Chat · MemorIAble" };

export default async function ChatPage() {
  const userId = await verifySession();
  const { workspaceId, isPersonal } = await getActiveWorkspace(userId);

  return (
    <>
      <PageHeader
        title="Chat"
        help={
          <>
            Canal compartido para todo el equipo — cualquier miembro puede escribir y leer, incluido el rol de
            solo lectura. Se actualiza solo, sin recargar la página.
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
        <ChatSection workspaceId={workspaceId} currentUserId={userId} />
      )}
    </>
  );
}

async function ChatSection({ workspaceId, currentUserId }: { workspaceId: string; currentUserId: string }) {
  const initialMessages = await listChatMessages();
  return <TeamChatView workspaceId={workspaceId} currentUserId={currentUserId} initialMessages={initialMessages} />;
}
