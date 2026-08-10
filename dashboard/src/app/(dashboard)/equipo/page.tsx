import type { Metadata } from "next";
import { listMyWorkspaces, getWorkspaceMembers } from "./actions";
import { PendingInvites } from "@/components/equipo/PendingInvites";
import { CreateTeamForm } from "@/components/equipo/CreateTeamForm";
import { TeamCard } from "@/components/equipo/TeamCard";
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
        <TeamCard
          key={team.id}
          workspaceId={team.id}
          nombre={team.nombre}
          members={team.members}
          canManage={team.role === "OWNER" || team.role === "ADMIN"}
        />
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
            Crea un equipo para compartir notas, tablero y calendario con otras personas — tu espacio Personal
            sigue intacto y solo tú lo ves. Añade gente por su email (debe tener ya una cuenta en MemorIAble);
            aparece como pendiente hasta que acepta. Cambia de espacio activo desde el selector de arriba.
          </>
        }
      />
      <SectionErrorBoundary title="Equipo">
        <EquipoSection />
      </SectionErrorBoundary>
    </>
  );
}
