"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, Loader2 } from "lucide-react";
import { setActiveWorkspace } from "@/app/(dashboard)/equipo/actions";
import { Avatar } from "@/components/ui/avatar";

/**
 * Fila del reparto de trabajo que lleva al tablero de ESA persona.
 *
 * El detalle que la hace correcta: `/equipo` enseña TODOS tus equipos, pero
 * el tablero siempre muestra el workspace ACTIVO. Un enlace directo desde
 * el reparto de un equipo que no es el activo abría el tablero de otro
 * equipo filtrado por alguien que quizá ni está en él — un tablero vacío
 * sin explicación. Por eso, si el equipo no es el activo, primero se cambia
 * (`setActiveWorkspace`) y solo después se navega.
 */
export function WorkloadRow({
  workspaceId,
  esWorkspaceActivo,
  userId,
  email,
  nombre,
  esSelf,
  abiertas,
  vencidas,
  completadasSemana,
  anchoTotal,
  anchoVencidas,
}: {
  workspaceId: string;
  esWorkspaceActivo: boolean;
  userId: string;
  email: string;
  /** Nombre para mostrar ya resuelto por el servidor (ver `displayName`). */
  nombre: string;
  esSelf: boolean;
  abiertas: number;
  vencidas: number;
  completadasSemana: number;
  /** % del ancho de la barra respecto a la persona más cargada. */
  anchoTotal: number;
  /** % del ancho de la barra que corresponde a lo vencido (dentro de `anchoTotal`). */
  anchoVencidas: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function abrirTablero() {
    startTransition(async () => {
      if (!esWorkspaceActivo) {
        const result = await setActiveWorkspace(workspaceId);
        // Si el cambio falla (te han sacado del equipo entre carga y clic),
        // no se navega: llevaría a un tablero que no es el que se pidió.
        if (result.error) return;
      }
      router.push(`/pendientes?asignado=${userId}`);
    });
  }

  return (
    <li>
      <button
        type="button"
        onClick={abrirTablero}
        disabled={pending}
        title={
          esWorkspaceActivo
            ? `Ver lo que lleva ${nombre}`
            : `Cambiar a este equipo y ver lo que lleva ${nombre}`
        }
        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
      >
        <Avatar email={email} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm text-ink">
              {nombre}
              {esSelf && <span className="ml-1 text-xs text-muted">(tú)</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums">
              {pending && <Loader2 aria-hidden size={11} className="animate-spin motion-reduce:animate-none" />}
              {abiertas === 0 ? "libre" : `${abiertas} abierta${abiertas === 1 ? "" : "s"}`}
              {completadasSemana > 0 && ` · ${completadasSemana} hecha${completadasSemana === 1 ? "" : "s"}`}
            </span>
          </div>
          {/* La barra es refuerzo, no la única señal: la cifra de al lado
              dice lo mismo en texto (nadie tiene que medir píxeles ni
              distinguir colores para entenderla). */}
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-line/50">
            <div className="relative h-full rounded-full bg-accent" style={{ width: `${anchoTotal}%` }}>
              {vencidas > 0 && anchoTotal > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-danger"
                  style={{ width: `${(anchoVencidas / anchoTotal) * 100}%` }}
                />
              )}
            </div>
          </div>
          {vencidas > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-danger">
              <TriangleAlert aria-hidden size={11} /> {vencidas} vencida{vencidas === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}
