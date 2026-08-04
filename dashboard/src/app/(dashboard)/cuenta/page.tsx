import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { LinkTelegramForm } from "./LinkTelegramForm";

export const metadata: Metadata = { title: "Cuenta · MemorIAble" };

export default async function CuentaPage() {
  const userId = await verifySession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, telegramChatId: true },
  });

  return (
    <section aria-labelledby="cuenta-heading" className="flex flex-col gap-6">
      <h2 id="cuenta-heading" className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-accent">
        👤 Cuenta
      </h2>

      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <p className="text-sm text-muted">Email</p>
        <p className="font-display text-lg text-ink">{user.email}</p>
      </div>

      <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
        <p className="mb-1 font-display text-lg text-ink">Telegram</p>
        {user.telegramChatId ? (
          <p className="text-sm text-muted">
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
    </section>
  );
}
