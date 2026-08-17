"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/**
 * Campo de contraseña con el ojo para ver lo que escribes — sobre todo en
 * el móvil, escribir una contraseña larga a ciegas es la primera causa de
 * "no me deja entrar" (y de que la gente acabe eligiendo contraseñas
 * cortas y malas para no equivocarse).
 *
 * `type` se controla aquí dentro, así que no se acepta por props: este
 * componente ES el campo de contraseña. El resto de props (name, required,
 * autoComplete, aria-*) pasan tal cual al input real.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        // Hueco para que el texto largo no pase por debajo del botón.
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // `aria-pressed` en vez de cambiar solo el icono: un lector de
        // pantalla necesita saber que es un interruptor y en qué estado está.
        aria-pressed={visible}
        aria-label={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
        title={visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}
        // -translate-y-1/2 sobre top-1/2: queda centrado sea cual sea la
        // altura del input, sin depender de un valor fijo.
        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {visible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
