"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  chatChannelTopic,
  CHAT_NEW_MESSAGE_EVENT,
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

/**
 * Se suscribe al canal de Broadcast del chat de un workspace — señal pura
 * ("hay un mensaje nuevo"), sin contenido (ver chatRealtime.ts). Sin
 * `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` configuradas, no se suscribe a
 * nada y `connected` se queda en `false` — quien la use debe apoyarse en un
 * sondeo de respaldo para ese caso (ver TeamChatView.tsx), no asumir que
 * esto entrega todos los mensajes.
 */
export function useChatRealtime(workspaceId: string | null, onMessage: () => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  // Ver el mismo patrón/comentario en useVisibilityAwarePolling.ts.
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!workspaceId) return;
    const client = getBrowserClient();
    if (!client) return;

    const channel = client.channel(chatChannelTopic(workspaceId));
    channel
      .on("broadcast", { event: CHAT_NEW_MESSAGE_EVENT }, () => onMessageRef.current())
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      setConnected(false);
      client.removeChannel(channel);
    };
  }, [workspaceId]);

  return { connected };
}
