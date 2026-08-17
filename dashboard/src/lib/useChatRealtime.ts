"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import {
  chatChannelTopic,
  CHAT_NEW_MESSAGE_EVENT,
  CHAT_TYPING_EVENT,
  supabaseRealtimeUrl,
  supabaseRealtimeAnonKey,
  isSupabaseRealtimeConfigured,
} from "./chatRealtime";

// Un único cliente para toda la pestaña (no uno por componente montado):
// crear un `SupabaseClient` abre su propio WebSocket — reutilizarlo es el
// mismo criterio que cualquier cliente de datos compartido (ver lib/prisma.ts).
let browserClient: SupabaseClient | null = null;
function getBrowserClient(): SupabaseClient | null {
  if (!isSupabaseRealtimeConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseRealtimeUrl()!, supabaseRealtimeAnonKey()!);
  }
  return browserClient;
}

interface TypingPayload {
  userId: string;
  email: string;
}

/**
 * Se suscribe al canal de Broadcast del chat de un workspace — señal pura
 * ("hay un mensaje nuevo" / "alguien escribe"), sin contenido de mensajes
 * (ver chatRealtime.ts). Sin `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`
 * configuradas, no se suscribe a nada, `connected` se queda en `false` y
 * `sendTyping` no hace nada — quien use `onMessage` debe apoyarse en un
 * sondeo de respaldo para ese caso (ver ConversationThread.tsx).
 */
export function useChatRealtime(
  workspaceId: string | null,
  onMessage: () => void,
  onTyping?: (payload: TypingPayload) => void,
): { connected: boolean; sendTyping: (payload: TypingPayload) => void } {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Ver el mismo patrón/comentario en useVisibilityAwarePolling.ts.
  useEffect(() => {
    onMessageRef.current = onMessage;
    onTypingRef.current = onTyping;
  });

  useEffect(() => {
    if (!workspaceId) return;
    const client = getBrowserClient();
    if (!client) return;

    const channel = client.channel(chatChannelTopic(workspaceId));
    channel
      .on("broadcast", { event: CHAT_NEW_MESSAGE_EVENT }, () => onMessageRef.current())
      .on("broadcast", { event: CHAT_TYPING_EVENT }, ({ payload }) => onTypingRef.current?.(payload as TypingPayload))
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    channelRef.current = channel;

    return () => {
      setConnected(false);
      channelRef.current = null;
      client.removeChannel(channel);
    };
  }, [workspaceId]);

  const sendTyping = useCallback((payload: TypingPayload) => {
    channelRef.current?.send({ type: "broadcast", event: CHAT_TYPING_EVENT, payload });
  }, []);

  return { connected, sendTyping };
}
