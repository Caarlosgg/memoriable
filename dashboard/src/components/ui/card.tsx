import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Superficie base del sistema de diseño. Existía desde el principio pero
 * NADIE la usaba: el string `rounded-2xl border border-paper-line
 * bg-paper-raised` estaba copiado a mano en 38 sitios de 33 archivos, con
 * radios y paddings que ya habían divergido entre pantallas equivalentes.
 *
 * Las variantes cubren los tres usos reales que había en ese copiado:
 * superficie normal, superficie interactiva (enlace/botón que reacciona al
 * hover) y hueco vacío con borde discontinuo.
 */
const cardVariants = cva("rounded-xl border transition-colors duration-base", {
  variants: {
    variant: {
      default: "border-paper-line bg-paper-raised shadow-xs",
      /** Para tarjetas que son enlace o botón: reaccionan al puntero. */
      interactive:
        "border-paper-line bg-paper-raised shadow-xs hover:border-accent hover:bg-accent-soft/40 hover:shadow-sm",
      /** Hueco sin contenido — ver también `EmptyState`, que ya lo usa. */
      dashed: "border-dashed border-paper-line bg-paper-raised/60",
      /** Sin fondo propio: para agrupar dentro de otra superficie. */
      plain: "border-paper-line bg-paper",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: { variant: "default", padding: "md" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding, className }))} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/**
 * Título de tarjeta. Antes era `font-mono uppercase tracking-[0.1em]` — un
 * tic que no usaba nadie y que chocaba con los títulos del resto de la app.
 * Ahora es el mismo tratamiento que se ve en las pantallas reales.
 */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />;
}
