import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shell de las páginas legales (términos, privacidad). Fuera del grupo
 * `(dashboard)` a propósito: tienen que poder leerse SIN sesión — se
 * enlazan desde el registro, antes de que exista ninguna cuenta (ver
 * `proxy.ts`, donde también están exentas).
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/" className="font-mono text-xs font-bold tracking-[0.14em] text-accent uppercase">
        MemorIAble
      </Link>
      <article className="flex flex-col gap-4 text-ink [&_a]:text-accent [&_a:hover]:text-accent-strong [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_li]:text-sm [&_li]:text-muted [&_p]:text-sm [&_p]:text-muted [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
        {children}
      </article>
    </main>
  );
}
