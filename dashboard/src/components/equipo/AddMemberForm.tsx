"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addMemberByEmail, type AddMemberResult } from "@/app/(dashboard)/equipo/actions";

const initialState: AddMemberResult = {};

export function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const action = async (_prev: AddMemberResult, formData: FormData): Promise<AddMemberResult> => {
    const email = String(formData.get("email") ?? "");
    const result = await addMemberByEmail(workspaceId, email);
    return result;
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
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <UserPlus aria-hidden size={14} /> {pending ? "Añadiendo…" : "Añadir"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {state?.sent && <p className="text-xs text-accent-strong">Invitación enviada — aparecerá como pendiente hasta que la acepte.</p>}
    </form>
  );
}
