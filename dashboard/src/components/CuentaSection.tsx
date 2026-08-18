import { User, CircleCheck, Send, Bell, Palette, Download, ChevronDown } from "lucide-react";
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
      <Grupo id="acceso" titulo="Cuenta y acceso" Icon={User} abierto>
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

/**
 * Bloque PLEGABLE dentro de /cuenta. Agrupar ya puso jerarquía, pero la
 * pantalla seguía siendo larguísima: cinco grupos con sus tarjetas, más el
 * resumen de actividad debajo — había que bajar mucho para llegar a
 * cualquier cosa. Plegados, la página entera cabe de un vistazo y cada
 * ajuste se abre solo cuando se va a tocar (que es casi nunca: son
 * preferencias, no tareas del día).
 *
 * `<details>` nativo y no un acordeón en React a propósito: es plegable con
 * teclado, lo anuncian los lectores de pantalla como tal y funciona sin
 * JavaScript — nada de esto habría que reimplementarlo.
 */
function Grupo({
  id,
  titulo,
  Icon,
  abierto = false,
  children,
}: {
  id: string;
  titulo: string;
  Icon: typeof User;
  /** Solo el primero viene abierto: es el que más se consulta (email, contraseña, sesiones). */
  abierto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={abierto} className="group flex flex-col gap-4" aria-labelledby={`cuenta-${id}`}>
      <summary
        id={`cuenta-${id}`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 font-mono text-xs font-bold tracking-[0.1em] text-accent uppercase transition-colors hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        <Icon aria-hidden size={14} /> {titulo}
        <ChevronDown aria-hidden size={14} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}
