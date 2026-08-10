import type { Notification } from "@prisma/client";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { WorkspaceSummary } from "@/app/(dashboard)/equipo/actions";
import { CommandPaletteButton } from "./CommandPaletteButton";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { NotificationBell } from "./NotificationBell";

/** Cabecera solo-móvil: en desktop el título y "Salir" viven en el Sidebar. */
export function MobileHeader({
  workspaces,
  activeWorkspaceId,
  notifications,
  unreadCount,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  notifications: Notification[];
  unreadCount: number;
}) {
  return (
    <header className="flex flex-col gap-2 border-b border-paper-line bg-paper-raised px-4 py-3 sm:hidden">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-lg font-semibold tracking-tight text-ink">MemorIAble</h1>
        <div className="flex items-center gap-1">
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <CommandPaletteButton />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden size={15} /> Salir
            </Button>
          </form>
        </div>
      </div>
      <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
    </header>
  );
}
