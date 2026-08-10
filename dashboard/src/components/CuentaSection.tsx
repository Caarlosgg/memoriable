import { User, CircleCheck } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { LinkTelegramForm } from "@/app/(dashboard)/cuenta/LinkTelegramForm";
import { ChangePasswordForm } from "@/app/(dashboard)/cuenta/ChangePasswordForm";
import { ExportSection } from "@/components/ExportSection";
import { ThemeSettings } from "@/components/ThemeSettings";

export async function CuentaSection() {
  const userId = await verifySession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, telegramChatId: true, passwordHash: true },
  });

  return (
    <section aria-labelledby="cuenta-heading" className="flex flex-col gap-6">
      <h2
        id="cuenta-heading"
        className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent"
      >
        <User aria-hidden size={14} /> Cuenta
      </h2>

      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <p className="text-sm text-muted">Email</p>
        <p className="font-display text-lg text-ink">{user.email}</p>
      </div>

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

      <ChangePasswordForm hasPassword={Boolean(user.passwordHash)} />

      <ThemeSettings />

      <ExportSection />
    </section>
  );
}
