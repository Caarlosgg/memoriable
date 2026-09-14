import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { presentCategory } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { checklistToArray, checklistProgress } from "@/lib/checklist";

export const metadata: Metadata = { title: "Nota compartida · MemorIAble" };

/**
 * Vista pública de solo lectura de una nota compartida (ver `toggleShare`
 * en actions.ts, y el botón "Compartir" en MessageDetailDialog.tsx). SIN
 * `verifySession`, a propósito: quien la abre no tiene por qué tener
 * cuenta — es justo el caso de uso (mandar una nota o una lista a alguien
 * que no usa MemorIAble). Fuera del grupo `(dashboard)`, así que no lleva
 * sidebar ni nada que insinúe que hay una sesión detrás.
 *
 * Deliberadamente NO enseña quién la creó, en qué equipo vive, ni ningún
 * enlace de vuelta al workspace — el token da acceso a ESTA nota, a nada
 * más de la cuenta que la compartió.
 */
export default async function CompartidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const message = await prisma.message.findUnique({
    where: { shareToken: token },
    select: { resumen: true, contenido: true, categoria: true, fecha: true, checklist: true },
  });
  if (!message) notFound();

  const { Icon, label, color, borderAccent } = presentCategory(message.categoria);
  const items = checklistToArray(message.checklist);
  const { hechos, total } = checklistProgress(items);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/" className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
        MemorIAble
      </Link>

      <article className={`flex flex-col gap-3 rounded-2xl border border-l-4 bg-paper-raised p-5 shadow-sm ${borderAccent}`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
          <Icon aria-hidden size={14} /> {label}
        </p>
        <h1 className="font-display text-xl leading-snug font-semibold text-ink">{message.resumen}</h1>
        <p className="whitespace-pre-wrap text-sm text-ink">{message.contenido}</p>

        {total > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-paper-line pt-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <ListChecks
                  aria-hidden
                  size={14}
                  className={item.hecho ? "text-accent" : "text-muted"}
                />
                <span className={item.hecho ? "text-muted line-through" : "text-ink"}>{item.texto}</span>
              </li>
            ))}
            <li className="pt-1 text-xs text-muted">{hechos}/{total} hechos</li>
          </ul>
        )}

        <p className="border-t border-paper-line pt-3 text-xs text-muted">{formatDate(message.fecha)}</p>
      </article>

      <p className="text-center text-xs text-muted">
        Compartido de solo lectura desde{" "}
        <Link href="/" className="text-accent hover:text-accent-strong">
          MemorIAble
        </Link>
        .
      </p>
    </main>
  );
}
