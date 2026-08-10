"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createWorkspace, setActiveWorkspace, type CreateWorkspaceResult } from "@/app/(dashboard)/equipo/actions";

const initialState: CreateWorkspaceResult = {};

async function action(_prev: CreateWorkspaceResult, formData: FormData): Promise<CreateWorkspaceResult> {
  const nombre = String(formData.get("nombre") ?? "");
  const result = await createWorkspace(nombre);
  // Recién creado, tiene sentido entrar en él directamente en vez de dejar
  // el workspace activo tal cual estaba — quien lo crea casi siempre quiere
  // seguir trabajando ahí mismo.
  if (result.workspaceId) await setActiveWorkspace(result.workspaceId);
  return result;
}

export function CreateTeamForm() {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Crear un equipo nuevo</h2>
      <p className="text-sm text-muted">
        Un espacio compartido aparte del personal — mismas notas, tablero y calendario, pero visibles solo para
        quien añadas.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="nombre-equipo" className="sr-only">
          Nombre del equipo
        </label>
        <Input id="nombre-equipo" name="nombre" required maxLength={60} placeholder="p. ej. Marketing" className="flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear equipo"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.workspaceId && !state.error && (
        <p className="text-sm text-accent-strong">Equipo creado — ya lo tienes activo.</p>
      )}
    </form>
  );
}
