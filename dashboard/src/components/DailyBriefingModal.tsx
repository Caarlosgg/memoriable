"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CircleCheck, Sparkles, ListChecks } from "lucide-react";
import { presentCategory } from "@/lib/categories";
import { formatEventDate } from "@/lib/format";
import type { DailyBriefingData } from "@/lib/dailyBriefing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

const MOTIVACIONALES = [
  "Estás al día — nada pendiente ahora mismo. Buen momento para lo que te apetezca.",
  "Todo en orden. Hoy puedes ir con calma.",
  "Sin pendientes a la vista. Aprovecha el hueco.",
];

function storageKey(userId: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `memoriable:briefing-visto:${userId}:${hoy}`;
}

/**
 * Aparece una vez al día, nada más entrar al dashboard, con el resumen del
 * día (misión principal, eventos de hoy, pendientes). "Visto hoy" se guarda
 * en localStorage por usuario+fecha — no hace falta tocar el esquema para
 * algo que es solo un recordatorio visual, no un dato del negocio.
 */
export function DailyBriefingModal({ userId, data }: { userId: string; data: DailyBriefingData }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = storageKey(userId);
    // Deferido a una tarea aparte (no directamente en el cuerpo del efecto):
    // mismo criterio que el resto del dashboard para leer estado del
    // navegador sin que el linter lo marque como "setState en efecto".
    const timer = setTimeout(() => {
      if (!localStorage.getItem(key)) setOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]);

  function handleClose() {
    localStorage.setItem(storageKey(userId), "1");
    setOpen(false);
  }

  const sinNada = !data.misionPrincipal && data.eventosHoy.length === 0;
  const mensajeMotivacional = MOTIVACIONALES[new Date().getDate() % MOTIVACIONALES.length];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="mb-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent">Tu día</p>
          <DialogTitle>{sinNada ? "Todo tranquilo" : "Esto es lo que tienes hoy"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {sinNada ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Sparkles aria-hidden size={28} className="text-accent" />
              <p className="text-sm text-ink">{mensajeMotivacional}</p>
            </div>
          ) : (
            <>
              {data.misionPrincipal && (
                <div className="rounded-lg border border-accent/30 bg-accent-soft p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
                    <CircleCheck aria-hidden size={14} /> Foco de hoy
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    {(() => {
                      const { Icon, color } = presentCategory(data.misionPrincipal.categoria);
                      return <Icon aria-hidden size={14} className={color} />;
                    })()}
                    {data.misionPrincipal.resumen}
                  </p>
                </div>
              )}

              {data.eventosHoy.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <CalendarDays aria-hidden size={14} /> Eventos de hoy
                  </p>
                  {data.eventosHoy.map((e) => (
                    <p key={e.id} className="text-sm text-ink">
                      {e.titulo} · {formatEventDate(e.fechaInicio)}
                      {e.ubicacion ? ` · ${e.ubicacion}` : ""}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5 border-t border-paper-line pt-3 text-xs text-muted">
                <ListChecks aria-hidden size={14} />
                {data.totalPendientes} pendiente{data.totalPendientes === 1 ? "" : "s"} en total
                {data.atascadas > 0 && ` · ${data.atascadas} llevan más de 5 días esperando`}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleClose}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
