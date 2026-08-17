/**
 * Piezas compartidas entre el aviso servidor→Realtime (chat/actions.ts) y
 * la suscripción cliente (useChatRealtime.ts) — sin "server-only": las dos
 * puntas necesitan el mismo nombre de canal/evento. `NEXT_PUBLIC_*` es
 * intencionadamente legible en ambos lados (así las diseña Supabase).
 *
 * El canal es SOLO una señal ("hay un mensaje nuevo"), nunca lleva el
 * texto/autor del mensaje — el contenido real siempre se sirve por
 * `listChatMessages` (Server Action con sesión verificada). Por eso el
 * canal puede ser público (sin Realtime Authorization/RLS): aunque alguien
 * adivinara el `workspaceId` de otro equipo, lo único que ganaría es saber
 * que "hubo actividad", nunca leer nada.
 */

/** Canal de Realtime Broadcast de UNA conversación (Fase Mensajería: ya no un único canal por workspace). */
export function chatChannelTopic(conversationId: string): string {
  return `chat-${conversationId}`;
}

export const CHAT_NEW_MESSAGE_EVENT = "new-message";

/**
 * "X está escribiendo…" — señal efímera, cliente a cliente, sobre el
 * mismo WebSocket ya abierto para los mensajes (sin pasar por el
 * servidor: no hay nada que guardar ni un mensaje real detrás). Solo
 * disponible cuando Realtime está configurado — sin él, no hay forma
 * barata de esto por sondeo, así que sencillamente no se muestra.
 */
export const CHAT_TYPING_EVENT = "typing";

export function supabaseRealtimeUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseRealtimeAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

/** true solo si las dos variables están puestas — mismo criterio "lazy" que el resto de integraciones externas (ver lib/pipeline.ts). */
export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(supabaseRealtimeUrl() && supabaseRealtimeAnonKey());
}
