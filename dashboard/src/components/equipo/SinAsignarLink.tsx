"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setActiveWorkspace } from "@/app/(dashboard)/equipo/actions";

/**
 * "N sin asignar" → el tablero con lo que no lleva nadie. Mismo cuidado que
 * `WorkloadRow`: si este equipo no es el activo, se cambia primero — si no,
 * el enlace abriría el tablero de OTRO equipo y enseñaría sus tareas sin
 * asignar, que no son las que se acaban de contar aquí.
 */
export function SinAsignarLink({
  workspaceId,
  esWorkspaceActivo,
  cuantas,
  children,
}: {
  workspaceId: string;
  esWorkspaceActivo: boolean;
  cuantas: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function abrir() {
    startTransition(async () => {
      if (!esWorkspaceActivo) {
        const result = await setActiveWorkspace(workspaceId);
        if (result.error) return;
      }
      router.push("/pendientes?asignado=sin-asignar");
    });
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={pending}
      aria-label={`Ver las ${cuantas} tareas sin asignar`}
      className="flex items-center gap-2 rounded-lg border border-dashed border-paper-line p-2.5 text-left text-sm text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
    >
      {children}
    </button>
  );
}
