"use client";

import { useActionState } from "react";
import type { WorkspaceRole } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { addMemberByEmail, type AddMemberResult } from "@/app/(dashboard)/equipo/actions";

const initialState: AddMemberResult = {};

export function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const action = async (_prev: AddMemberResult, formData: FormData): Promise<AddMemberResult> => {
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "MEMBER") as WorkspaceRole;
    return addMemberByEmail(workspaceId, email, role);
  };
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`add-member-${workspaceId}`} className="sr-only">
          Email de la persona a añadir
        </label>
        <Input
          id={`add-member-${workspaceId}`}
          name="email"
          type="email"
          required
          placeholder="email@ejemplo.com"
          className="flex-1"
        />
        <label htmlFor={`add-role-${workspaceId}`} className="sr-only">
          Rol de la persona a añadir
        </label>
        <Select id={`add-role-${workspaceId}`} name="role" defaultValue="MEMBER">
          <option value="MEMBER">Miembro</option>
          <option value="ADMIN">Administrador</option>
          <option value="VIEWER">Solo lectura</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <UserPlus aria-hidden size={14} /> {pending ? "Añadiendo…" : "Añadir"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Si ya tiene cuenta en MemorIAble, le llegará una invitación para aceptar. Si no, le creamos la cuenta y le
        mandamos un enlace para elegir contraseña.
      </p>
      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {state?.sent && !state.accountCreated && (
        <p className="text-xs text-accent-strong">Invitación enviada — aparecerá como pendiente hasta que la acepte.</p>
      )}
      {state?.sent && state.accountCreated && (
        <p className="text-xs text-accent-strong">
          Cuenta creada — le hemos mandado un correo para que elija su contraseña y active la cuenta.
        </p>
      )}
    </form>
  );
}
