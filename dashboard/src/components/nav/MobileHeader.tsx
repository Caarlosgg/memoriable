import { LogOut } from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CommandPaletteButton } from "./CommandPaletteButton";

/** Cabecera solo-móvil: en desktop el título y "Salir" viven en el Sidebar. */
export function MobileHeader() {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-paper-line bg-paper-raised px-4 py-3 sm:hidden">
      <h1 className="font-display text-lg font-semibold tracking-tight text-ink">MemorIAble</h1>
      <div className="flex items-center gap-1">
        <CommandPaletteButton />
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden size={15} /> Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
