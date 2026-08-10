import { initialsFromEmail, avatarColorClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
} as const;

/** Círculo con iniciales — la única "identidad visual" disponible, ver lib/avatar.ts. */
export function Avatar({
  email,
  size = "sm",
  className,
}: {
  email: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <span
      title={email}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZE_CLASSES[size],
        avatarColorClass(email),
        className,
      )}
    >
      {initialsFromEmail(email)}
    </span>
  );
}
