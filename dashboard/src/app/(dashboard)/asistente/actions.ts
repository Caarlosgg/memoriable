"use server";

import { verifySession } from "@/lib/dal";
import {
  getConversationExchanges,
  listConversations,
  type AssistantExchangeRecord,
  type ConversationSummary,
} from "@/lib/assistantHistory";

/** Carga los intercambios de una conversación propia para continuarla en el chat. */
export async function loadConversation(conversationId: string): Promise<AssistantExchangeRecord[]> {
  const userId = await verifySession();
  return getConversationExchanges(userId, conversationId);
}

/**
 * Lista las conversaciones del usuario — usada por `AssistantProvider` para
 * cargarlas en cliente (el propio proveedor vive en el layout, montado antes
 * de saber si la primera pantalla será /asistente, así que no puede recibir
 * esta lista ya resuelta por props desde un Server Component como antes).
 */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  const userId = await verifySession();
  return listConversations(userId);
}
