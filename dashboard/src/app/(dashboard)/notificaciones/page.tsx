import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { listNotifications } from "@/lib/notifications";
import { NotificationsList } from "@/components/notificaciones/NotificationsList";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Notificaciones · MemorIAble" };

async function NotificationsSection() {
  const userId = await verifySession();
  const notifications = await listNotifications(userId, 100);
  return <NotificationsList notifications={notifications} />;
}

export default function NotificacionesPage() {
  return (
    <>
      <PageHeader
        title="Notificaciones"
        help={
          <>
            Aquí llega el aviso cuando alguien te asigna una tarea o un evento en un workspace de equipo. Haz clic
            en una para ir directamente a ella y marcarla como leída.
          </>
        }
      />
      <SectionErrorBoundary title="Notificaciones">
        <NotificationsSection />
      </SectionErrorBoundary>
    </>
  );
}
