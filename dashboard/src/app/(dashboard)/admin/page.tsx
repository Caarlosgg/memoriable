import type { Metadata } from "next";
import Link from "next/link";
import { Users, Building2, StickyNote, CalendarDays, UserPlus } from "lucide-react";
import { requireSuperAdmin } from "@/lib/dal";
import { getAdminStats } from "./actions";
import { PageHeader } from "@/components/PageHeader";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export const metadata: Metadata = { title: "Administración · MemorIAble" };

const STAT_CARDS = [
  { key: "totalUsers", label: "Usuarios", Icon: Users },
  { key: "totalWorkspaces", label: "Espacios en total", Icon: Building2 },
  { key: "totalTeamWorkspaces", label: "Equipos", Icon: Building2 },
  { key: "signupsLast7Days", label: "Altas en 7 días", Icon: UserPlus },
  { key: "totalMessages", label: "Notas/tareas", Icon: StickyNote },
  { key: "totalEventos", label: "Eventos", Icon: CalendarDays },
] as const;

async function AdminStatsSection() {
  await requireSuperAdmin();
  const stats = await getAdminStats();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {STAT_CARDS.map(({ key, label, Icon }) => (
        <div key={key} className="flex flex-col gap-1 rounded-2xl border border-paper-line bg-paper-raised p-4">
          <Icon aria-hidden size={18} className="text-accent" />
          <span className="font-display text-2xl font-semibold text-ink">{stats[key]}</span>
          <span className="text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administración"
        help={
          <>
            Panel global, solo para superadministradores: cifras de toda la aplicación, y gestión de cualquier
            usuario o equipo (no solo los tuyos). Ve a <b>Usuarios</b> o <b>Equipos</b> para las acciones concretas.
          </>
        }
      />
      <nav className="flex gap-2 text-sm font-medium">
        <Link
          href="/admin/usuarios"
          className="rounded-full border border-paper-line px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent-strong"
        >
          Usuarios
        </Link>
        <Link
          href="/admin/equipos"
          className="rounded-full border border-paper-line px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent-strong"
        >
          Equipos
        </Link>
      </nav>
      <SectionErrorBoundary title="Administración">
        <AdminStatsSection />
      </SectionErrorBoundary>
    </>
  );
}
