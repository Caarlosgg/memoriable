"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptChatInvite,
  declineChatInvite,
  type PendingChatInvite,
} from "@/app/(dashboard)/chat/actions";

export function PendingChatInvites({
  invitations,
}: {
  invitations: PendingChatInvite[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function respond(conversationId: string, action: "accept" | "decline") {
    setPendingId(conversationId);
    setError(null);
    startTransition(async () => {
      const result = await (action === "accept"
        ? acceptChatInvite(conversationId)
        : declineChatInvite(conversationId));
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (invitations.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-highlight/40 bg-highlight-soft p-5">
      <h2 className="font-display text-lg font-semibold text-ink">
        Invitaciones a grupos de chat
      </h2>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <li
            key={inv.conversationId}
            className="flex items-center justify-between gap-3 rounded-lg bg-paper-raised px-3 py-2.5"
          >
            <span className="font-medium text-ink">
              {inv.nombre}{" "}
              <span className="font-normal text-muted">
                · {inv.participantes}{" "}
                {inv.participantes === 1 ? "persona" : "personas"}
              </span>
            </span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                disabled={pendingId === inv.conversationId}
                onClick={() => respond(inv.conversationId, "accept")}
              >
                <Check aria-hidden size={14} /> Aceptar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pendingId === inv.conversationId}
                onClick={() => respond(inv.conversationId, "decline")}
              >
                <X aria-hidden size={14} /> Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
