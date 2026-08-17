import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/dal";
import { listAdminUsers } from "../actions";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";

export const metadata: Metadata = { title: "Usuarios · Administración · MemorIAble" };

async function AdminUsersSection() {
  await requireSuperAdmin();
  const users = await listAdminUsers();
  return <AdminUsersTable initialUsers={users} />;
}

export default function AdminUsersPage() {
  return (
    <>
      <BackLink href="/admin" label="Administración" />
      <PageHeader
        title="Usuarios"
        help={
          <>
            Todas las cuentas de la aplicación. Puedes forzar el restablecimiento de contraseña (se manda un
            enlace por email, nunca ves la contraseña), verificar el email a mano, conceder o retirar acceso a
            este panel, y eliminar una cuenta entera (rechaza la operación si todavía tiene contenido en un
            equipo compartido, para no arrastrar datos de otras personas).
          </>
        }
      />
      <SectionErrorBoundary title="Usuarios">
        <AdminUsersSection />
      </SectionErrorBoundary>
    </>
  );
}
