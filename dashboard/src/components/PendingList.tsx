"use client";

import { useState, useTransition } from "react";
import type { Message } from "@prisma/client";
import { markDone } from "@/app/(dashboard)/actions";
import { MessageCard } from "./MessageCard";

export function PendingList({
  initialMessages,
}: {
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDone(id: string) {
    setCompletingId(id);
    startTransition(async () => {
      try {
        await markDone(id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch (err) {
        console.error("No se pudo marcar como hecho:", err);
        setCompletingId(null); // revierte el fade: el mensaje sigue pendiente
      }
    });
  }

  return (
    <section aria-labelledby="pendientes-heading" className="flex flex-col gap-3">
      <h2
        id="pendientes-heading"
        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
      >
        <span aria-hidden>📋</span>
        Pendientes
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {messages.length}
        </span>
      </h2>

      {messages.length === 0 ? (
        <p className="fade-in rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
          No tienes nada pendiente. ¡Bien!
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
            const completing = completingId === message.id;
            return (
              <li
                key={message.id}
                className={`transition-all duration-300 ease-out ${
                  completing ? "scale-95 opacity-0" : "scale-100 opacity-100"
                }`}
              >
                <MessageCard message={message}>
                  <button
                    type="button"
                    onClick={() => handleDone(message.id)}
                    disabled={isPending && completing}
                    className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Marcar como hecho
                  </button>
                </MessageCard>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
