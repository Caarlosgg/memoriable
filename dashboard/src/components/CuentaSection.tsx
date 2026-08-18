import { User, CircleCheck, Send, Bell, Palette, Download } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, getHiddenCategories } from "@/lib/workspace";
import { LinkTelegramForm } from "@/app/(dashboard)/cuenta/LinkTelegramForm";
import { ChangePasswordForm } from "@/app/(dashboard)/cuenta/ChangePasswordForm";
import { CloseOtherSessionsForm } from "@/app/(dashboard)/cuenta/CloseOtherSessionsForm";
import { ExportSection } from "@/components/ExportSection";
import { ThemeSettings } from "@/components/ThemeSettings";
import { NotificationPrefsForm } from "@/components/NotificationPrefsForm";
import { HiddenCategoriesForm } from "@/components/HiddenCategoriesForm";
import { PushNotificationsToggle } from "@/components/PushNotificationsToggle";
import { hasPushSubscription, type NotificationPrefs } from "@/app/(dashboard)/cuenta/actions";

export async function CuentaSection() {
  const userId = await verifySession();
  const [user, { workspaceId }, pushEnabled] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, telegramChatId: true, passwordHash: true, notificationPrefs: true },
    }),
    getActiveWorkspace(userId),
    hasPushSubscription(),
  ]);
  const hiddenCategories = await getHiddenCategories(userId, workspaceId);

  return (
    <div className="flex flex-col gap-8">
      {/* Agrupada en bloques con encabezado: eran diez tarjetas seguidas sin
          jerarquía, así que encontrar "silenciar avisos" o "exportar" era
          cuestión de recorrerlas todas. Las tarjetas no cambian; lo que
          cambia es que ahora hay dónde mirar. */}
      <Grupo id="acceso" titulo="Cuenta y acceso" Icon={User}>
        <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
          <p className="text-sm text-muted">Email</p>
          <p className="font-display text-lg text-ink">{user.email}</p>
        </div>
        <ChangePasswordForm hasPassword={Boolean(user.passwordHash)} />
        <CloseOtherSessionsForm />
      </Grupo>

      <Grupo id="captura" titulo="Captura" Icon={Send}>
        <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
          <p className="mb-1 font-display text-lg text-ink">Telegram</p>
          {user.telegramChatId ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <CircleCheck aria-hidden size={15} className="text-accent" />
              Chat vinculado. Los mensajes que le mandes al bot se guardan en tu cuenta.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Todavía no has vinculado ningún chat de Telegram: el bot no sabrá que los mensajes son
                tuyos hasta que lo hagas.
              </p>
              <LinkTelegramForm />
            </>
          )}
        </div>
      </Grupo>

      <Grupo id="avisos" titulo="Avisos" Icon={Bell}>
        <NotificationPrefsForm initialPrefs={(user.notificationPrefs as NotificationPrefs | null) ?? {}} />
        <PushNotificationsToggle initialEnabled={pushEnabled} />
      </Grupo>

      <Grupo id="apariencia" titulo="Apariencia y contenido" Icon={Palette}>
        <ThemeSettings />
        <HiddenCategoriesForm initialHidden={hiddenCategories} />
      </Grupo>

      <Grupo id="datos" titulo="Tus datos" Icon={Download}>
        <ExportSection />
      </Grupo>
    </div>
  );
}

/** Bloque con encabezado dentro de /cuenta — mismo estilo de rótulo que el resto de secciones de la app. */
function Grupo({
  id,
  titulo,
  Icon,
  children,
}: {
  id: string;
  titulo: string;
  Icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`cuenta-${id}`} className="flex flex-col gap-4">
      <h2
        id={`cuenta-${id}`}
        className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.1em] text-accent uppercase"
      >
        <Icon aria-hidden size={14} /> {titulo}
      </h2>
      {children}
    </section>
  );
}
