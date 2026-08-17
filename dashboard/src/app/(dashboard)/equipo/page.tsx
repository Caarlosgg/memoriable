import type { Metadata } from "next";
import { listMyWorkspaces, getWorkspaceMembers } from "./actions";
import { PendingInvites } from "@/components/equipo/PendingInvites";
import { CreateTeamForm } from "@/components/equipo/CreateTeamForm";
import { TeamCard } from "@/components/equipo/TeamCard";
import { ActivityFeed } from "@/components/equipo/ActivityFeed";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Equipo · MemorIAble" };

async function EquipoSection() {
  const workspaces = await listMyWorkspaces();
  const invitations = workspaces.filter((w) => w.status === "PENDING");
  // El workspace personal no aparece aquí: no tiene "miembros" que gestionar
  // más allá de ti mismo (ver lib/workspace.ts).
  const teams = workspaces.filter((w) => w.status === "ACTIVE" && !w.personal);

  const teamsWithMembers = await Promise.all(
    teams.map(async (team) => ({
      ...team,
      members: await getWorkspaceMembers(team.id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PendingInvites invitations={invitations} />
      <CreateTeamForm />
      {teamsWithMembers.map((team) => (
        <div key={team.id} className="flex flex-col gap-2">
          <TeamCard
            workspaceId={team.id}
            nombre={team.nombre}
            members={team.members}
            canManage={team.role === "OWNER" || team.role === "ADMIN"}
          />
          <ActivityFeed workspaceId={team.id} />
        </div>
      ))}
      {teamsWithMembers.length === 0 && (
        <p className="text-center text-sm text-muted">
          Todavía no formas parte de ningún equipo — crea uno arriba, o pide que te añadan por tu email.
        </p>
      )}
    </div>
  );
}

export default function EquipoPage() {
  return (
    <>
      <PageHeader
        title="Equipo"
        help={
          <>
            Gestión de plantilla: crea equipos, añade gente y decide su rol — Miembro (crea/edita todo),
            Administrador (además añade/quita personas) o Solo lectura (ve el tablero/calendario compartido sin
            poder tocar nada, ideal para un cliente o colaborador externo). Si ya tiene cuenta en MemorIAble le
            llega una invitación para aceptar; si no tiene, se le crea la cuenta y elige su contraseña desde el
            enlace que le mandamos. Tu espacio Personal sigue intacto y solo tú lo ves — cambia de espacio
            activo desde el selector de arriba de la barra lateral en cualquier momento.
          </>
        }
      />
      <SectionErrorBoundary title="Equipo">
        <EquipoSection />
      </SectionErrorBoundary>
    </>
  );
}
