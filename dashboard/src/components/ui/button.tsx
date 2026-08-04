import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botón base del sistema de diseño (Fase 4): un solo sitio que define
 * hover/active/focus-visible/disabled para todos los botones de la app, en
 * vez de que cada componente los repita a mano con ligeras variaciones.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 outline-none disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-ink shadow-sm hover:bg-accent-strong hover:-translate-y-px active:translate-y-0 active:bg-accent-strong",
        secondary:
          "border border-paper-line bg-paper-raised text-ink hover:border-accent hover:bg-accent-soft active:bg-accent-soft",
        ghost: "text-muted hover:bg-accent-soft hover:text-accent-strong active:bg-accent-soft",
        destructive:
          "bg-danger/10 text-danger hover:bg-danger/20 active:bg-danger/25 focus-visible:ring-danger",
        outline:
          "border border-paper-line bg-transparent text-ink hover:border-danger/40 hover:bg-danger-soft hover:text-danger",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
