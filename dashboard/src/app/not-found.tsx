import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 404 propio, con la identidad del producto en vez de la página en blanco de Next. */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="fade-in flex max-w-md flex-col items-center gap-4 rounded-2xl border border-paper-line bg-paper-raised p-8 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Compass aria-hidden size={22} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-semibold text-ink">Aquí no hay nada</h1>
          <p className="text-sm text-muted">La página que buscas no existe o se ha movido.</p>
        </div>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
