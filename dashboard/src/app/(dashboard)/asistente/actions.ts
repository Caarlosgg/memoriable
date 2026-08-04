"use server";

import { verifySession } from "@/lib/dal";
import { getConversationExchanges, type AssistantExchangeRecord } from "@/lib/assistantHistory";

/** Carga los intercambios de una conversación propia para continuarla en el chat. */
export async function loadConversation(conversationId: string): Promise<AssistantExchangeRecord[]> {
  const userId = await verifySession();
  return getConversationExchanges(userId, conversationId);
}
