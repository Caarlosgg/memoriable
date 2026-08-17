"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Check, Circle, X } from "lucide-react";
import { dismissOnboarding } from "@/app/(dashboard)/cuenta/actions";

function StepRow({ done, optional, href, children }: { done: boolean; optional?: boolean; href?: string; children: ReactNode }) {
  const content = (
    <span className="flex items-start gap-2">
      {done ? (
        <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
      ) : (
        <Circle aria-hidden size={16} className="mt-0.5 shrink-0 text-muted" />
      )}
      <span className={done ? "text-muted line-through decoration-muted/50" : "text-ink"}>
        {children}
        {optional && !done && <span className="ml-1 text-xs text-muted">(opcional)</span>}
      </span>
    </span>
  );

  if (href && !done) {
    return (
      <li>
        <Link
          href={href}
          className="block rounded-lg p-1 transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {content}
        </Link>
      </li>
    );
  }
  return <li className="p-1">{content}</li>;
}

/**
 * Tarjeta "primeros pasos" en /asistente — solo se monta cuando de verdad
 * hace falta (ver OnboardingChecklist.tsx, que decide si mostrarla). Cierre
 * optimista: oculta al instante al pulsar la X, sin esperar a que la
 * Server Action confirme — reaparecer un instante si falla sería más
 * molesto que el caso raro de que el cierre no se guarde.
 */
export function OnboardingChecklistCard({
  telegramLinked,
  hasFirstNote,
  hasTeam,
}: {
  telegramLinked: boolean;
  hasFirstNote: boolean;
  hasTeam: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  function handleDismiss() {
    setHidden(true);
    startTransition(() => {
      dismissOnboarding().catch((err) => console.error("No se pudo cerrar «primeros pasos»:", err));
    });
  }

  return (
    <div className="fade-in flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-ink">Primeros pasos</p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar primeros pasos"
          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X aria-hidden size={15} />
        </button>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <StepRow done={telegramLinked} href="/cuenta">
          Vincula tu Telegram para empezar a capturar notas, tareas y citas.
        </StepRow>
        <StepRow done={hasFirstNote}>
          Mándale un mensaje al bot (o pídeselo al Asistente aquí abajo) — aparecerá aquí, categorizado.
        </StepRow>
        <StepRow done={hasTeam} optional href="/equipo">
          Invita a tu equipo para compartir el tablero y el calendario.
        </StepRow>
      </ul>
    </div>
  );
}
