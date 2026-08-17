import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/dal";
import { listAdminWorkspaces } from "../actions";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { AdminWorkspacesTable } from "@/components/admin/AdminWorkspacesTable";

export const metadata: Metadata = { title: "Equipos · Administración · MemorIAble" };

async function AdminWorkspacesSection() {
  await requireSuperAdmin();
  const workspaces = await listAdminWorkspaces();
  return <AdminWorkspacesTable workspaces={workspaces} />;
}

export default function AdminWorkspacesPage() {
  return (
    <>
      <BackLink href="/admin" label="Administración" />
      <PageHeader
        title="Equipos"
        help={
          <>
            Todos los espacios de la aplicación, personales y de equipo. Solo se pueden eliminar equipos (no
            espacios personales, eso se gestiona desde Usuarios) y solo si ya no tienen notas ni eventos.
          </>
        }
      />
      <SectionErrorBoundary title="Equipos">
        <AdminWorkspacesSection />
      </SectionErrorBoundary>
    </>
  );
}
