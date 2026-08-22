import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import {
  listConversations,
  listChatMessages,
  listPendingChatInvites,
} from "./actions";
import { ChatShell } from "@/components/chat/ChatShell";
import { PendingChatInvites } from "@/components/chat/PendingChatInvites";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { isBlobConfigured } from "@/lib/blobUpload";

export const metadata: Metadata = { title: "Chat · MemorIAble" };

async function ChatSection({
  conversacionPedida,
}: {
  conversacionPedida: string | undefined;
}) {
  const userId = await verifySession();

  const [conversations, pendingInvites] = await Promise.all([
    listConversations(),
    listPendingChatInvites(),
  ]);
  // Solo se respeta `?c=` si de verdad es una conversación suya — así un id
  // inventado en la URL no deja la pantalla en blanco, simplemente abre la
  // primera como siempre.
  const initialSelectedId =
    (conversacionPedida &&
    conversations.some((c) => c.id === conversacionPedida)
      ? conversacionPedida
      : null) ??
    conversations[0]?.id ??
    null;
  const initialMessages = initialSelectedId
    ? await listChatMessages(initialSelectedId)
    : [];

  return (
    <>
      <PendingChatInvites invitations={pendingInvites} />
      <ChatShell
        initialConversations={conversations}
        initialSelectedId={initialSelectedId}
        initialMessages={initialMessages}
        currentUserId={userId}
        puedeAdjuntar={isBlobConfigured()}
      />
    </>
  );
}

export default async function ChatPage({
  searchParams,
}: {
  // `?c=<id>`: abrir una conversación concreta al llegar — lo usa el botón
  // de "escribir" del equipo, que crea/reutiliza el hilo y trae aquí
  // directamente en vez de dejar al usuario buscándolo en la lista.
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: conversacionPedida } = await searchParams;

  return (
    <>
      <PageHeader
        title="Chat"
        help={
          <>
            Tu espacio de mensajería: habla en individual o en grupo con
            cualquiera que tenga cuenta en MemorIAble, sea o no de tu equipo.
            Cada equipo del que formes parte tiene además su grupo
            &quot;Equipo&quot; automático. Se actualiza solo, sin recargar la
            página.
          </>
        }
      />
      {/* Antes las tres consultas (conversaciones, invitaciones, mensajes)
          bloqueaban directo en el Server Component: el navegador se quedaba
          sin ningún feedback hasta que resolvían, y si cualquiera fallaba se
          llevaba por delante toda la pantalla — sidebar incluido — en vez de
          solo esta sección. Mismo patrón que /equipo. */}
      <SectionErrorBoundary title="Chat">
        <Suspense fallback={<div className="skeleton h-96 rounded-2xl" aria-hidden />}>
          <ChatSection conversacionPedida={conversacionPedida} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}
